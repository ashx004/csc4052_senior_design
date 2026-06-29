export default function Home() {
  const greeting: string = "s t u d o r a .";

  return (
    <div className="flex min-h-screen justify-center pt-40">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-black font-sans mb-2">
          {greeting}
        </h1>

        <p className="text-black font-mono font-thin text-sm mt-6">
          More than just notes !
        </p>
      </div>
    </div>
  );
}
