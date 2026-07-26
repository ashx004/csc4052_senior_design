"use client";

export default function Profile() {
  return (
    <section className="flex h-screen flex-col bg-bg-main text-text-main">
      <header
        className="
          relative flex h-[73px] shrink-0 items-center justify-between
          border-b border-border-light bg-bg-container px-6" >
        <h1
          className="
            absolute left-1/2 -translate-x-1/2 text-center
            text-lg font-semibold tracking-[0.45em] text-text-main" >
          Profile.
        </h1>
      </header>
    </section>
  );
}