import { describe, expect, it } from "vitest";
import { classifyThinkingNeed, type ThinkTier } from "./thinkRouter";

const ask = (...texts: string[]) =>
  classifyThinkingNeed(texts.map((content, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content })));

describe("classifyThinkingNeed", () => {
  it.each([
    "When is the assignment due?",
    "when is homework 1 due",
    "What time is office hours?",
    "Who is the professor for CSC 325?",
    "Where is my class room?",
    "what's the late policy",
    "thanks!",
    "hey",
    "got it",
  ])("fast path: %s", (text) => {
    expect(ask(text).tier).toBe("fast");
  });

  it.each([
    "Explain this proof step by step",
    "Why does quicksort have O(n log n) average complexity?",
    "Solve 3x + 5 = 20 and show your work",
    "What is the derivative of x^2 * sin(x)?",
    "Compare TCP and UDP",
    "Can you debug this?\n```js\nfor (;;) {}\n```",
    "What's the difference between a mutex and a semaphore?",
    "Can you help? " + "I am struggling with this chapter ".repeat(20),
    "What is chapter 3 about? What is chapter 4 about? What about chapter 5?",
  ])("full think: %s", (text) => {
    expect(ask(text).tier).toBe("deep");
  });

  it("gives actions and ambiguous asks the standard tier", () => {
    expect(ask("make me a quiz on chapter 3").tier).toBe("standard");
    expect(ask("add homework 2 to my calendar").tier).toBe("standard");
    expect(ask("yes do it").tier).toBe("standard");
    expect(ask("tell me about the midterm review session logistics").tier).toBe("standard");
    expect(ask("").tier).toBe("standard");
  });

  it("does not treat a compound question as a lookup", () => {
    expect(ask("When is the exam and what should I study for it?").tier).toBe("standard");
  });

  it("deep reasoning wins over a lookup-looking phrase", () => {
    expect(ask("Explain when the assignment is due and why").tier).toBe("deep");
  });

  it("lets a bare follow-up inherit the previous question's tier", () => {
    expect(ask("When is homework 1 due?", "Friday at 11:59pm.", "and homework 2?").tier).toBe("fast");
    expect(ask("Explain this proof step by step", "Sure, first...", "and the next one?").tier).toBe("deep");
  });

  it("does not inherit when the follow-up has its own signal", () => {
    expect(ask("When is homework 1 due?", "Friday.", "Explain why that deadline matters").tier).toBe("deep");
  });

  it("looks only at the latest user message", () => {
    expect(ask("Explain this proof step by step", "ok...", "When is the exam?").tier).toBe("fast");
  });

  it("gives a reason for each decision", () => {
    expect(ask("hello").reason).toMatch(/greeting/);
    expect(ask("derive the quadratic formula").reason).toMatch(/reason/);
  });
});

// Realistic student messages labeled with the tier a reviewer would want.
// A reasoning question sent to the fast tier is the costly mistake (a worse
// answer), so that is asserted separately from overall agreement.
const F = "fast", S = "standard", D = "deep";
const LABELED: Array<[string, ThinkTier]> = [
  ["When is the assignment due?", F],
  ["when's the midterm", F],
  ["what time does class start on Tuesday", F],
  ["Where is the final exam?", F],
  ["who's my TA", F],
  ["How many credits is CSC 305?", F],
  ["what is the late policy", F],
  ["is attendance mandatory", F],
  ["what's the professor's email", F],
  ["when are office hours", F],
  ["What's on the schedule for tomorrow?", F],
  ["do I have class tomorrow", F],
  ["how much is the final worth", F],
  ["what room is the lab in", F],
  ["is homework 3 due friday", F],
  ["what is my next deadline", F],
  ["when does the semester end", F],
  ["which textbook do we use", F],
  ["what are the grading weights", F],
  ["what day is the exam", F],
  ["Is the quiz open book?", F],
  ["what does the syllabus say about late work", F],
  ["how many assignments are left", F],
  ["when is spring break", F],
  ["hi", F],
  ["thanks!", F],
  ["ok cool", F],
  ["got it, thank you", F],
  ["good morning", F],
  ["perfect", F],
  ["lol nice", F],
  ["never mind", F],
  ["Explain this proof step by step", D],
  ["why does gradient descent converge", D],
  ["can you walk me through dijkstra's algorithm", D],
  ["What's the time complexity of merge sort and why?", D],
  ["solve x^2 - 5x + 6 = 0", D],
  ["help me understand recursion", D],
  ["I don't get how pointers work", D],
  ["why is my code throwing a null pointer exception", D],
  ["what's wrong with this query: SELECT * FROM a JOIN b", D],
  ["compare BFS and DFS", D],
  ["prove that sqrt 2 is irrational", D],
  ["how do I approach this dynamic programming problem", D],
  ["Explain normalization in databases", D],
  ["what's the difference between 2NF and 3NF", D],
  ["why is the sky blue", D],
  ["Can you derive the normal equation for linear regression?", D],
  ["what happens if I take the transpose of a symmetric matrix", D],
  ["how would you design a schema for a library system", D],
  ["I got 3 on question 4 but the answer key says 5, why?", D],
  ["is this argument valid: all cats are mammals, some mammals swim, so some cats swim", D],
  ["Check my answer: the integral of 2x is x^2 + C", D],
  ["review my essay thesis and tell me if it's strong", D],
  ["what are the pros and cons of using a hash map here", D],
  ["help me think through whether to take CSC 325 or CSC 340 next semester", D],
  ["Quiz me on chapter 3 and explain what I get wrong", D],
  ["translate this recurrence T(n)=2T(n/2)+n into big-o", D],
  ["what is the meaning of the second paragraph", D],
  ["how does TCP handshake work", D],
  ["figure out why my tests fail", D],
  ["Why did the Roman Empire fall?", D],
  ["what caused the 2008 financial crisis", D],
  ["give me a mnemonic to remember the planets", S],
  ["make me a quiz on chapter 3", S],
  ["add homework 2 to my calendar", S],
  ["yes do it", S],
  ["create flashcards from my notes", S],
  ["summarize my lecture 4 notes", S],
  ["delete the study session on friday", S],
  ["move my exam to the 12th", S],
  ["remind me about the quiz", S],
  ["can you schedule a study block tomorrow at 3", S],
  ["rename this note to Week 3", S],
  ["build me a study plan for finals", D],
  ["what should I work on today", S],
  ["what's my plan for the week", S],
  ["open my CSC 305 notes", S],
  ["find my notes about transactions", S],
  ["show me my grades", S],
  ["list my assignments", S],
  ["tell me about this course", S],
  ["what's in my notes on indexes", S],
  ["when is the exam and what should I study", S],
  ["what is due this week and how should I prioritize", S],
  ["how many points is the final and how do I get an A", S],
  ["what's the late policy? can I still get credit if I submit tomorrow", S],
  ["why", D],
  ["and the next one?", S],
  ["how come", D],
  ["what about homework 2", S],
  ["explain", D],
  ["what's the grading policy for group projects and why is it that way", D],
  ["how do I register for classes", S],
  ["how do I submit homework on canvas", S],
  ["how do I get to the library", S],
  ["how do I reset my password", S],
  ["what is the deadline to drop a class", F],
  ["what's the due date for the project proposal", F],
  ["WHEN IS THE EXAM", F],
  ["whens the final project due??", F],
  ["wen is hw 2 due", F],
  ["what classes am i taking", F],
  ["who teaches databases", F],
  ["what's 15% of 80", D],
  ["what is 7 * 8", D],
  ["what is the capital of France", F],
  ["define normalization", S],
  ["what does ACID stand for", F],
  ["what is a deadlock", S],
  ["what's a foreign key", S],
  ["difference between inner and left join", D],
  ["what is O(n)", D],
  ["write a python function to reverse a string", D],
  ["implement a linked list in java", D],
  ["write me an email to my professor asking for an extension", S],
  ["I'm stressed about finals", S],
  ["I feel behind in this class what should I do", S],
  ["can I get an extension", S],
  ["Where do I turn in lab 4?", F],
  ["when is the next quiz", F],
  ["what's the due date for lab 2", F],
  ["is the final cumulative", F],
  ["who is teaching CSC 340 this fall", F],
  ["do we have class on monday", F],
  ["how many exams are there", F],
  ["what time is my 2pm class", F],
  ["is the syllabus on canvas", F],
  ["whats the grading scale", F],
  ["are there any assignments due today", F],
  ["which room is the review session in", F],
  ["what is the course code for databases", F],
  ["when do grades come out", F],
  ["how much is homework worth", F],
  ["thx", F],
  ["ok thanks", F],
  ["sounds good thanks", F],
  ["alright", F],
  ["haha ok", F],
  ["Why does my for loop skip the last element?", D],
  ["how does a B-tree stay balanced", D],
  ["walk me through the 2008 midterm question 3", D],
  ["explain the difference between supervised and unsupervised learning", D],
  ["can you check my proof of the pigeonhole principle", D],
  ["I keep getting a segfault, here's my code: int *p = NULL; *p = 3;", D],
  ["what's the integral of 1/x from 1 to e", D],
  ["is 91 prime", D],
  ["I'm confused about how foreign keys differ from primary keys", D],
  ["why do we need indexes", D],
  ["can you reason through whether this schema is in BCNF", D],
  ["what would happen to the runtime if I used a linked list instead", D],
  ["how should I structure my essay on the French Revolution", D],
  ["critique my thesis statement", D],
  ["derive the variance of a binomial", D],
  ["tell me why recursion needs a base case", D],
  ["What does the Krebs cycle produce and why does it matter?", D],
  ["which sorting algorithm is best for nearly sorted data and why", D],
  ["simplify (x^2 - 1)/(x - 1)", D],
  ["balance this equation: H2 + O2 -> H2O", D],
  ["make me flashcards for chapter 5", S],
  ["add a study session on thursday at 4pm", S],
  ["schedule time to work on my project tomorrow", S],
  ["quiz me on SQL joins", S],
  ["summarize this week's lecture notes", S],
  ["cancel my tutoring appointment", S],
  ["put the final on my calendar", S],
  ["generate a practice exam for CSC 305", S],
  ["what's due this week", S],
  ["what should I study tonight", S],
  ["how do I add a class", S],
  ["how do I find my advisor", S],
  ["can you help me", S],
  ["I need help", S],
  ["tell me something about this class", S],
  ["ok do it", S],
  ["when is the exam and how should I prepare for it", S],
  ["what's the late penalty and can I appeal it", S],
  ["what are my deadlines and which should I do first", S],
  ["Hello! Can you tell me when homework 4 is due and also explain how to start it?", D],
  ["what's my gpa", F],
  ["what's the weather like for the campus tour", S],
  ["recommend a good book on algorithms", S],
  ["translate 'good morning' to Spanish", S],
  ["how do you spell necessary", S],
  ["what is the time complexity of binary search", D],
  ["give me a hint for question 3", D],
  ["I got an error: TypeError undefined is not a function", D],
  ["can you grade my answer: mitochondria makes ATP", D],
];

describe("classifyThinkingNeed on labeled student messages", () => {
  it("agrees with every label", () => {
    const mismatches = LABELED.filter(([text, want]) => ask(text).tier !== want).map(([text, want]) => `${want}: ${text}`);
    expect(mismatches).toEqual([]);
  });

  it("never sends a reasoning question to the fast tier", () => {
    const tooShallow = LABELED.filter(([text, want]) => want === D && ask(text).tier === F).map(([text]) => text);
    expect(tooShallow).toEqual([]);
  });
});
