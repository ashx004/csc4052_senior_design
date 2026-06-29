import React from 'react';

export default function App() {
  const greeting: string = "S T U D O R A";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900">
      <div className="text-center p-8 bg-slate-800 rounded-2xl shadow-xl border border-slate-700">
        <h1 className="text-3xl font-bold text-sky-400 mb-2">
          {greeting}
        </h1>
        <p className="text-slate-400 text-sm">
          tia, cameron, ashton, khai
        </p>
      </div>
    </div>
  );
}
