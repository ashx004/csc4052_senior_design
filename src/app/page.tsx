export default function Home() {
  const greeting: string = "s t u d o r a .";

  return (
    <div className="flex min-h-screen justify-center bg-orange-50 pt-40">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-black font-sans mb-2">
          {greeting}
        </h1>

        <p className="text-black font-mono font-thin text-sm mt-6">
          More than just notes !
        </p>

        <div className="mt-40 flex flex-col items-center">
          <button className="bg-transparent font-thin text-sm underline
          text-black font-mono cursor-pointer px-4 py-1 rounded 
          hover:bg-gray-100 active:bg-gray-200">
            Log-In
          </button>

          <button className="mt-2 bg-transparent font-thin text-sm underline
          text-black font-mono cursor-pointer px-3 py-1 rounded 
          hover:bg-gray-100 active:bg-gray-200">
            Create a new account
          </button>

          <button className="mt-20 bg-white font-thin text-sm
          text-black font-mono cursor-pointer px-10 py-2 rounded 
          hover:bg-gray-100 active:bg-gray-200 flex items-center 
          gap-2">
            <span> Sign in with Google </span>
            <img 
              src="/google-logo.png" 
              alt="Google Icon" 
              className="w-6 h-6"
            />
          </button>

          <button className="mt-5 bg-white font-thin text-sm
          text-black font-mono cursor-pointer px-8 py-2 rounded 
          hover:bg-gray-100 active:bg-gray-200 flex items-center 
          gap-2">
            <span> Sign in with Apple </span>
            <img 
              src="/apple-logo.png" 
              alt="Apple Icon" 
              className="w-5 h-5"
            />
          </button>
        </div>
      </div>
    </div>
  );
}