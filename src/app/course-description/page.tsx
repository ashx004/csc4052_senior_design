export default function Home() {
  const greeting: string = "Course Description";

  return (
    // main box
    <div className="min-h-screen justify-center pt-40  m-8 text-center bg-blue-600">
        <h1 className="text-4xl font-bold text-black font-sans mb-2">
          {greeting}
        </h1>

        <div className="m-auto flex justify-center w-[50%]">
            <div>
                <b>Course Name:</b><br/>
                CSC 4052<br/>
                
            </div>
            <div>
                <b>Instructor:</b><br/>
                Kyle Prather <br/>
                
            </div>
            <div>
                <b>Instructor office hours:</b><br/>
                MWF 9 am - 4 pm <br/>
                
            </div>
            <div>
                <b>Insructor Email:</b><br/>
                kprather@latech.edu <br/>
                
            </div>
            <div>
                <b>Instructor Phone Number:</b><br/>
                (225) 998-2077 <br/>
                
            </div>

        </div>
        <div className="flex rounded-2xl m-[20%] my-5 bg-red-500 ">

            <div className="m-auto w-[10%]">
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
        <div>
            <b>Course Resources:</b><br/>
            Syllabus, Assignment 1, Assignment 2,  <br/>
        </div>

        <p className="text-black font-mono font-thin text-sm mt-6">
          More than just notes !
        </p>

      </div>
  );
}
