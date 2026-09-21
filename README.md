# csc4052_senior_design

# To run: 

1.) Clone the repository: 
* ssh: `git clone git@github.com:ashx004/csc4052_senior_design.git`
* https: `git clone https://github.com/ashx004/csc4052_senior_design`

2.) Navigate to the directory

3.) Install dependencies with `npm install` at the root of the project directory (`csc4052_senior_design/`)

4.) Create a `.env.local` file (copy `env.example`) and set `NEXT_PUBLIC_FIREBASE_API_KEY` (and any other required env vars like `MINIO_*`). Keep this file out of version control.

5.) Run `npm run dev` at the root of the project directory

6.) Navigate to localhost at the port exposed in the output window (typically 3000)

For durable OCR and document-indexing jobs, run `npm run worker:ocr` as a
separate managed process. Set `OCR_WORKER_URL` to the deployed
`/api/document-jobs/worker` endpoint and provide the same `INTERNAL_API_SECRET`
used by the web application.
