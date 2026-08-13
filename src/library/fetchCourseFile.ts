export async function fetchCourseFile(
  url: string,
  idToken?: string | null
): Promise<Response> {
  const headers = new Headers();
  if (idToken) headers.set("Authorization", `Bearer ${idToken}`);

  return fetch(url, {
    credentials: "include",
    cache: "no-store",
    headers,
  });
}
