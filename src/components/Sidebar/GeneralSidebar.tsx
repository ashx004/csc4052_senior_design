"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {Home,Briefcase,Calendar,MessageSquare,Users,User,BookOpen, Notebook } from "lucide-react";
import Sidebar from "./Sidebar";

const links = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Classes", href: "/classes", icon: Briefcase },
  { label: "Learning", href: "/learning", icon: BookOpen },
  { label: "AI Assistant", href: "/ai-assistant", icon: MessageSquare },
  { label: "Notes", href: "/notes", icon: Notebook },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Advising", href: "/advising_new", icon: Users },
  { label: "Profile", href: "/profile", icon: User },
];

export default function GeneralSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <ul className="flex flex-col gap-1" data-tutorial="sidebar-nav">
        {links.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href;

          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${
                  isActive
                    ? "bg-white/15 font-semibold text-white hover:text-[#f5eadf]"
                    : "text-white/65 hover:bg-white/10 hover:text-[#f5eadf]"
                }`}
              >
                <Icon size={20} strokeWidth={1.5} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Sidebar>
  );
}
