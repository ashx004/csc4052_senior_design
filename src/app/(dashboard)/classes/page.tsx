"use client";

import ClassCard, { ClassCardProps } from '@/src/components/ClassCard';

export default function Classes() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen py-2">
            <h1 className="text-4xl font-bold mb-8">Classes</h1>
            <div className="flex flex-wrap justify-center gap-8">
                <ClassCard courseName="Math 101" courseCode="MATH 101" term="Fall 2023" />
                <ClassCard courseName="History 201" courseCode="HIST 201" term="Spring 2024" />
                <ClassCard courseName="Science 301" courseCode="SCI 301" term="Summer 2023" />
                <ClassCard courseName="Art 401" courseCode="ART 401" term="Fall 2023" />
                <ClassCard courseName="Computer Science 501" courseCode="CS 501" term="Spring 2024" />
                <ClassCard courseName="Literature 601" courseCode="LIT 601" term="Summer 2023" />
            </div>
        </div>
    );
}
