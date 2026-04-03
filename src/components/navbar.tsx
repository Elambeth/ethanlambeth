"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function Navbar() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <nav className="max-w-2xl mx-auto px-6 py-6 flex justify-between items-center">
      <div className="flex gap-4">
        <Link href="/" className="hover:underline">
          Home
        </Link>
        <Link href="/thoughts" className="hover:underline">
          Thoughts
        </Link>
      </div>

      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="text-sm hover:underline"
      >
        {mounted && theme === "dark" ? "Light" : "Dark"}
      </button>
    </nav>
  );
}