import * as cheerio from "cheerio";
import { CourseOfferingRecord, CourseOfferingSnapshot, CourseOfferingSource } from "./types";
import { Term } from "@/src/library/academicTerm";

// Confirmed live during planning (2026-07): a single large HTML <table>,
// first <tr class="tableHeader"> is the header row, every other <tr> has
// exactly 6 <td>s: [code, title, Fall, Winter, Spring, Summer]. Each term
// cell is either <td class="inactive"></td> (not offered) or
// <td class="active"><div class="tooltip">✓<span class="tooltiptext">
// Year(s) offered: '21, '22, ...</span></div></td>. No JSON/API alternative
// exists for this source.
const TERM_COLUMN_ORDER: Term[] = ["Fall", "Winter", "Spring", "Summer"];

function parseYears(tooltipText: string): number[] {
  // Matches both confirmed grammatical forms: "Year offered: '21" (singular)
  // and "Years offered: '21, '22, ..." (plural).
  const match = tooltipText.match(/offered:\s*(.+)/i);
  if (!match) return [];

  return match[1]
    .split(",")
    .map((piece) => piece.trim().replace(/^'/, ""))
    .filter(Boolean)
    .map((yy) => (yy.length === 2 ? 2000 + parseInt(yy, 10) : parseInt(yy, 10)))
    .filter((year) => Number.isFinite(year));
}

function createProtohacksSource(): CourseOfferingSource {
  const sourceUrl = process.env.COURSE_OFFERING_SOURCE_URL || "https://www.protohacks.net/LATech/coursehistory/";

  return {
    id: "protohacks-latech",
    async fetch(): Promise<CourseOfferingSnapshot> {
      const response = await fetch(sourceUrl, {
        headers: {
          "User-Agent": "CatalystAdvisingBot/1.0 (student course-planning feature; see app for contact)",
        },
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        throw new Error(`Course offering source request failed (${response.status})`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const courses: CourseOfferingRecord[] = [];

      $("table tr").each((_, row) => {
        const $row = $(row);
        if ($row.hasClass("tableHeader")) return;

        const cells = $row.find("td");
        if (cells.length < 6) return; // malformed/unexpected row — skip rather than throw

        const courseCode = $(cells[0]).text().trim();
        const title = $(cells[1]).text().trim();
        if (!courseCode) return;

        const offeredTerms = {} as CourseOfferingRecord["offeredTerms"];
        TERM_COLUMN_ORDER.forEach((term, i) => {
          const cell = $(cells[2 + i]);
          const offered = cell.hasClass("active");
          const years = offered ? parseYears(cell.find(".tooltiptext").text()) : [];
          offeredTerms[term] = { offered, years };
        });

        courses.push({ courseCode, title, offeredTerms });
      });

      // A real signal the page's structure changed, not a transient hiccup
      // to silently cache as an empty result.
      if (courses.length === 0) {
        throw new Error("Parsed zero courses from the course offering source — its HTML structure may have changed.");
      }

      return { sourceId: "protohacks-latech", sourceUrl, fetchedAt: new Date(), courses };
    },
  };
}

export { createProtohacksSource };
