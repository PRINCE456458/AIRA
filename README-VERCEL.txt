PUT AIRA ON VERCEL (free) - everyone just opens your link, no Python or Ollama

NEVER upload the file ".env" anywhere. NEVER paste your keys in chat.

=========== STEP 0 - the files must be in the RIGHT PLACE (most common mistake) ===========
On your GitHub repository's main page you must see these RIGHT AWAY (not inside another folder):

    app.py
    dbx.py
    requirements.txt
    pages        (folder)
    public       (folder)
    README-VERCEL.txt ...

If you only see ONE folder called "aira-web" and have to click into it to find app.py, it is wrong:
Vercel will show 404 NOT_FOUND. Fix: upload the files from INSIDE that folder.
Check inside "public" there is a folder "static" with style.css, app.js, logo.svg and PNG images.

=========== STEP 1 - Free AI key (Groq) ===========
console.groq.com > API Keys > Create API Key. Copy the key (starts with gsk_) to a private Notepad file.
Model name to use:  llama-3.3-70b-versatile   (type it EXACTLY - one wrong letter breaks it)

=========== STEP 2 - Free database (Turso) ===========
turso.tech > create a database named aira > copy its URL (starts with libsql://) > create a token (read and write).

=========== STEP 3 - Vercel ===========
1. vercel.com > Continue with GitHub.
2. Add New > Project > choose your repository > Import. (Framework should show Flask or Python.)
3. Open "Environment Variables". Add these, name on the left, value on the right,
   NO quotes, NO spaces:
       AI_BASE_URL          https://api.groq.com/openai/v1
       AI_MODEL             llama-3.3-70b-versatile
       AI_API_KEY           (your new Groq key)
       TURSO_DATABASE_URL   (libsql://...)
       TURSO_AUTH_TOKEN     (the long token)
       ADMIN_PASSWORD       (a long password you invent)
4. Press Deploy and wait for "Congratulations".

=========== STEP 4 - CHECK IT WORKS: open  YOUR-LINK/status ===========
That page lists every setting with OK or FIX. It never shows your keys.
Press "Run the live AI test" - it should say "The AI answered".
Fix every red FIX line, then Vercel > Deployments > the three dots > Redeploy, and reload /status.

=========== STEP 5 - Instagram ===========
Instagram > Edit profile > Links > Add external link > paste your Vercel link (the one ending in .vercel.app).

=========== If you still see an error ===========
- "404: NOT_FOUND"            -> Step 0 (files inside an extra folder), or the deploy failed (Deployments shows red).
- Page asks you to log in to Vercel -> Project > Settings > Deployment Protection: turn off protection for Production,
                                       and share the main .vercel.app link, not a long preview link.
- Build error (red text)      -> copy the last red lines to me. Do not include keys.
- 500 / "FUNCTION_INVOCATION_FAILED" -> open Vercel > your project > Logs, copy the newest error line to me.
- Chat says "settings look wrong"    -> open /status and fix the FIX lines (usually the model name).
- Data disappears             -> TURSO_ variables are missing; /status says TEMPORARY storage.
- A very long website-builder answer is cut off -> Vercel's free plan limits how long one answer may take. Ask for a smaller page.

Web search is OFF by default (it needs an extra library that I could not test on Vercel).
To try it: add a new line   ddgs   to requirements.txt, then redeploy. If the build fails, remove that line again.
