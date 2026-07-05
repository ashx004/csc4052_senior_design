import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import { EnrollmentFields } from '@/src/app/(dashboard)/classes/page';

// TODO: test with auth when implemented
async function getEnrollment(
    userId: string,
    enrollmentId: string
): Promise<EnrollmentFields | null> {
    const docRef = doc(db, "users", userId, "enrollment", enrollmentId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
        console.log("No such document!");
        return null;
    }

    const data = docSnap.data();

    return {
        className: data.className,
        classCode: data.classCode,
        term: data.term,
        time: data.time,
        facultyPhoneNumber: data.facultyPhoneNumber,
        facultyOfficeNumber: data.facultyOfficeNumber,
        facultyEmail: data.facultyEmail,
        facultyName: data.facultyName,
        classSchedule: data.classSchedule,
    };
}

// formats a raw phone number string into (XXX) XXX-XXXX
// falls back to the original string if it doesn't contain exactly 10 digits
function formatPhoneNumber(phone?: string): string {
    if (!phone) return "Not provided";

    const digits = phone.replace(/\D/g, "");

    if (digits.length !== 10) {
        return phone;
    }

    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default async function CourseOverview({
    params,
}: {
    params: Promise<{ courseId: string }>;
}) {
    const { courseId } = await params;

    // TODO: when auth is implemented, replace "12345678" with the current user's ID
    const enrollment = await getEnrollment("12345678", courseId).catch((error) => {
        console.error("Error getting enrollment: ", error);
        return null;
    });

    if (!enrollment) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#FAF7F0]">
                <div className="text-center">
                    <h1 className="text-xl font-semibold text-[#3D3A34]">Course not found</h1>
                    <p className="mt-1 text-sm text-[#8A8477]">
                        We couldn&apos;t find a class with that ID.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FAF7F0] px-6 py-10 sm:px-10">
            <div className="mx-auto max-w-4xl">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-2 text-sm text-[#8A8477]">
                        <span className="font-medium text-[#B08957]">{enrollment.classCode}</span>
                        <span>&middot;</span>
                        <span>{enrollment.term}</span>
                    </div>
                    <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#3D3A34]">
                        {enrollment.className}
                    </h1>
                </div>

                {/* Info cards */}

                {/* CLASS DETAILS */}
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-[#EDE6D8]">
                        <h2 className="text-sm font-semibold text-[#3D3A34]">Class Details</h2>
                        <dl className="mt-4 space-y-3">
                            <div>
                                <dt className="text-xs text-[#8A8477]">Schedule</dt>
                                <dd className="mt-0.5 text-sm text-[#3D3A34]">
                                    {enrollment.classSchedule || "Not provided"}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-[#8A8477]">Time</dt>
                                <dd className="mt-0.5 text-sm text-[#3D3A34]">
                                    {enrollment.time || "Not provided"}
                                </dd>
                            </div>
                        </dl>
                    </div>

                    {/* INSTRUCTOR */}
                    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-[#EDE6D8]">
                        <h2 className="text-sm font-semibold text-[#3D3A34]">Instructor</h2>
                        <dl className="mt-4 space-y-3">
                            <div>
                                <dt className="text-xs text-[#8A8477]">Name</dt>
                                <dd className="mt-0.5 text-sm text-[#3D3A34]">
                                    {enrollment.facultyName || "Not provided"}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-[#8A8477]">Office</dt>
                                <dd className="mt-0.5 text-sm text-[#3D3A34]">
                                    {enrollment.facultyOfficeNumber || "Not provided"}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-[#8A8477]">Email</dt>
                                <dd className="mt-0.5 text-sm">
                                    {enrollment.facultyEmail ? (
                                        
                                        <a    href={`mailto:${enrollment.facultyEmail}`}
                                            className="text-[#B08957] hover:underline"
                                        >
                                            {enrollment.facultyEmail}
                                        </a>
                                    ) : (
                                        <span className="text-[#3D3A34]">Not provided</span>
                                    )}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-[#8A8477]">Phone</dt>
                                <dd className="mt-0.5 text-sm text-[#3D3A34]">
                                    {formatPhoneNumber(enrollment.facultyPhoneNumber)}
                                </dd>
                            </div>
                        </dl>
                    </div>
                </div>

                {/* Resources */}
                <div className="mt-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-[#EDE6D8]">
                    <h2 className="text-sm font-semibold text-[#3D3A34]">Course Resources</h2>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {[1, 2, 3].map((n) => (
                            <div
                                key={n}
                                className="overflow-hidden rounded-lg ring-1 ring-[#EDE6D8] transition-shadow hover:shadow-md"
                            >
                                <img
                                    src="/example-document.png"
                                    alt={`Document ${n}`}
                                    className="h-full w-full object-cover"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}