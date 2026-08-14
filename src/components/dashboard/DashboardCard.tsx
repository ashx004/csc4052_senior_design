import React from "react";
import "./DashboardCard.css";

export interface DashboardCardProps {
  icon: string;
  title: string;
  description: string;
  href: string;
}

export default function DashboardCard({ icon, title, description, href }: DashboardCardProps) {
  return (
    <div className="dashboard-card">
      <div className="dashboard-card-icon">
        {/* renders icon */}
        <img src={icon} alt="" className="dashboard-card-icon-img" />
      </div>
      {/* renders title and description */}
      <h3 className="dashboard-card-title">{title}</h3>
      <p className="dashboard-card-description">{description}</p>
      {/* renders link to the href */}
      <a href={href} className="dashboard-card-action">
        <span>Let's Go!</span>
        <span className="dashboard-card-arrow" aria-hidden="true">
          »
        </span>
      </a>
    </div>
  );
}