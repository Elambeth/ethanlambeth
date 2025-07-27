"use client";

import Link from "next/link";
import { useTheme } from "next-themes";

export default function Navbar() {
  const { theme, setTheme } = useTheme();

  return (
    <nav className="max-w-2xl mx-auto px-6 py-6 flex justify-between items-center">
      <Link 
        href="https://substack.com/@cognicarbon" 
        className="hover:underline"
        target="_blank"
      >
        Blog
      </Link>
      
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="text-sm hover:underline"
      >
        {theme === "dark" ? "Light" : "Dark"}
      </button>
    </nav>
  );
}