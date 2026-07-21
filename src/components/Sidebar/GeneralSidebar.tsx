"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {Home,Briefcase,Calendar,MessageSquare,Users,User,} from "lucide-react";
import Sidebar from "./Sidebar";

const links = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Classes", href: "/classes", icon: Briefcase },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "AI Assistant", href: "/ai-assistant", icon: MessageSquare },
  { label: "Advising", href: "/advising", icon: Users },
  { label: "Profile", href: "/profile", icon: User },
];

export default function GeneralSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <ul className="flex flex-col gap-1">
        {links.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href;

          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? "bg-bg-warm font-semibold text-text-main"
                    : "text-text-muted hover:bg-bg-warm"
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