import { describe, expect, it } from "vitest";
import { OutputGuard, StreamingGuard } from "./outputGuard";

const facts = () => ({
  urls: ["/api/download?key=users%2Fu%2Fclasses%2Fc%2F1_Guide.pdf", "https://www.youtube.com/watch?v=XB4MIexjvY0"],
  emails: ["mankimin@LATech.edu", "coriell@latech.edu"],
  ids: new Map([
    ["K6Psx2LsjGZKjb7Uo1P0", "CSC 130"],
    ["MeruFS7LQMPe3maQKhrP", ""],
  ]),
});

describe("OutputGuard.clean", () => {
  it("drops a made-up download link but keeps its words", () => {
    const g = new OutputGuard(facts());
    expect(g.clean("Download it here: [Guide.pdf](/download/Guide.pdf) now")).toBe("Download it here: Guide.pdf now");
  });

  it("drops dead and unknown-address links", () => {
    const g = new OutputGuard(facts());
    expect(g.clean("Click [Study Flashcards](#) to start")).toBe("Click Study Flashcards to start");
    expect(g.clean("[Email him](mailto:coriell@latech.edu) or [them](mailto:x@y.edu)")).toBe("[Email him](mailto:coriell@latech.edu) or them");
  });

  it("keeps links a tool actually returned", () => {
    const g = new OutputGuard(facts());
    const text = "Watch [Abdul Bari](https://www.youtube.com/watch?v=XB4MIexjvY0) and grab [the guide](/api/download?key=users%2Fu%2Fclasses%2Fc%2F1_Guide.pdf).";
    expect(g.clean(text)).toBe(text);
  });

  it("removes invented bare URLs", () => {
    const g = new OutputGuard(facts());
    expect(g.clean("Log into Canvas (https://canvas.latech.edu) to check.")).toBe("Log into Canvas to check.");
    expect(g.clean("Visit https://made-up.example.com/page for more.")).toBe("Visit for more.");
  });

  it("repairs a mangled copy of a real email and flags unknown ones", () => {
    const g = new OutputGuard(facts());
    expect(g.clean("Email Dr. Min at man kimin@LATech.edu today.")).toBe("Email Dr. Min at mankimin@LATech.edu today.");
    expect(g.clean("Try kimin@LATech.edu.")).toBe("Try mankimin@LATech.edu.");
    expect(g.clean("Write to registrar@latech.edu")).toBe("Write to (email not on file)");
    expect(g.clean("Reach coriell@latech.edu")).toBe("Reach coriell@latech.edu");
    expect(g.clean("e.g. name@example.com")).toBe("e.g. name@example.com");
    expect(g.clean("use a real address, like `jdoe@latech.edu`.")).toBe("use a real address, like `jdoe@latech.edu`.");
  });

  it("hides internal IDs", () => {
    const g = new OutputGuard(facts());
    expect(g.clean('The file in CSC 130 (course ID `K6Psx2LsjGZKjb7Uo1P0`) is a zip.')).toBe("The file in CSC 130 is a zip.");
    expect(g.clean("titled Sorting Algorithms.pdf (resource ID: MeruFS7LQMPe3maQKhrP), which")).toBe("titled Sorting Algorithms.pdf, which");
    expect(g.clean("class K6Psx2LsjGZKjb7Uo1P0 docs")).toBe("class CSC 130 docs");
  });

  it("learns new facts from tool results mid-turn", () => {
    const g = new OutputGuard(facts());
    g.allowFrom("Result: https://docs.python.org/3/whatsnew/3.14.html by help@python.org");
    expect(g.clean("See https://docs.python.org/3/whatsnew/3.14.html or help@python.org")).toBe(
      "See https://docs.python.org/3/whatsnew/3.14.html or help@python.org"
    );
  });
});

describe("quote verification", () => {
  it("keeps real quotes and un-quotes invented ones", () => {
    const g = new OutputGuard(facts());
    g.allowFrom("Radix sort: we want the numbers to be sorted to have a fixed number of digits (d) and we can sort the numbers starting from the last digit.");
    expect(g.clean("> Radix sort: we want the numbers to be sorted to have a fixed number of digits (d)")).toBe(
      "> Radix sort: we want the numbers to be sorted to have a fixed number of digits (d)"
    );
    expect(g.clean("> Radix sort sorts numbers by each digit using a stable sort, in linear time overall.")).toBe(
      "Radix sort sorts numbers by each digit using a stable sort, in linear time overall."
    );
    expect(g.clean('The notes say "radix sort sorts numbers digit by digit using stable sorting to reach linear time" here.')).toBe(
      "The notes say radix sort sorts numbers digit by digit using stable sorting to reach linear time here."
    );
    expect(g.clean('It\'s "short" and fine.')).toBe('It\'s "short" and fine.');
    const titles = 'It was titled **"Dijkstra summary"** in your CSC 325 notes (Exam 2 review notebook) and was later renamed to "Dijkstra\'s algorithm".';
    expect(g.clean(titles)).toBe(titles);
  });
});

describe("StreamingGuard", () => {
  const run = (chunks: string[]) => {
    let out = "";
    const s = new StreamingGuard(new OutputGuard(facts()), (t) => (out += t));
    chunks.forEach((c) => s.push(c));
    s.flush();
    return out;
  };

  it("cleans text split at awkward chunk boundaries", () => {
    expect(run(["Email ", "man", " kim", "in@LAT", "ech.edu for ", "help ", "please"])).toBe("Email mankimin@LATech.edu for help please");
    expect(run(["Get it: [Gui", "de.pdf](/down", "load/Guide.pdf) ", "today ", "ok"])).toBe("Get it: Guide.pdf today ok");
  });

  it("removes an ID wrapper even when it streams in word by word", () => {
    expect(run(["The zip in CSC 130 ", "(course ", "ID: ", "`K6Psx2", "LsjGZKjb7Uo1P0`) ", "is ", "an ", "assignment."])).toBe("The zip in CSC 130 is an assignment.");
  });

  it("passes ordinary text through unchanged", () => {
    const text = "Heap sort, merge sort, and quick sort run in Θ(n log n).\n\n- Bucket sort\n- Radix sort";
    expect(run(text.match(/[\s\S]{1,7}/g)!)).toBe(text);
  });
});

describe("tool names", () => {
  it("says them in the app's words", () => {
    const guard = new OutputGuard(facts());
    expect(guard.clean("You can review them anytime with `list_notes`!")).toBe("You can review them anytime with the Notes tab!");
    expect(guard.clean("I used create_quiz() to make it.")).toBe("I used a quiz to make it.");
    expect(guard.clean("Your notes list is ready.")).toBe("Your notes list is ready.");
  });
});
