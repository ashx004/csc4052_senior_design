export default function Home() {
  const greeting: string = "Course Description";

  return (
    // Background
    <body className="justify-center text-center bg-gray-200">
        {/* Inner page */}
        <div className="rounded-2xl m-8 shadow-2xl py-20 bg-gray-400">
            {/* Greeting */}
            <h1 className="text-4xl font-bold text-black font-sans mb-2">
            {greeting}
            </h1>

            {/* General Information */}
            <div className="flex rounded-2xl m-auto justify-center w-[50%] bg-gray-200 p-5">
                {/* Left Info */}
                {/* Description and schedule */}
                <div className="grid text-left px-2 w-[50%]">
                    <div className="text-2xl">
                        <b>Course Name:</b><br/>
                        CSC 4052
                    </div>
                    <div className="">
                        <b>Course Desc:</b><br/>
                        Senior Capstone I is the first of two courses that compose the Computer Science Senior Design series. Upon completion of 
                        this course, students and their teams will continue development on their current projects 
                        into Senior Capston II. <br/>
                        
                    </div>
                    <div>
                        <b>Course Schedule:</b><br/>
                        MWF 10 am - 11:15 am <br/>
                    </div>
                </div>

                {/* Right, Stacked Info */}
                <div className="grid text-left px-2 w-[50%]">
                    <div className=" text-2xl">
                        <b>Instructor:</b><br/>
                        Kyle Prather
                    </div>
                    <div className="">
                        <b>Office hours:</b><br/>
                        MWF 9 am - 4 pm
                    </div>
                    <div className="">
                        <b>Insructor Email:</b><br/>
                        kprather@latech.edu
                    </div>
                    <div className="">
                        <b>Instructor Phone Number:</b><br/>
                        (225) 998-2077
                    </div>
                </div>
            </div>

            {/* Uesr-Course Resources */}
            <div className="bg-grey-200">
                <b className="text-xl">Course Resources:</b>
                <div className="flex justify-center p-2">
                    <div>
                        Syllabus, 
                    </div>
                    <div>
                        Assignment 1, 
                    </div>
                    <div>
                        Assignment 2,
                    </div>
                </div>
            </div>

            {/* Footer */}
            <p className="text-black font-mono font-thin text-sm mt-6">
            More than just notes !
            </p>
        </div>
    </body>
  );
}
