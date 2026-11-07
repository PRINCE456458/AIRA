AIRA WEBSITE - how to use (simple steps)
(Putting it on Vercel? Read README-VERCEL.txt instead of Step 3.)

STEP 1 - Test on your laptop (Ollama must be running)
  1. Make a new folder "aira-web" and put all these files in it (keep the "static" folder as it is).
  2. Rename ".env.example" to ".env"  (if Windows hides it, turn on "File name extensions" in File Explorer).
  3. Open a terminal in that folder and run:
        pip install -r requirements.txt
        python app.py
  4. Open http://127.0.0.1:5000/status to check your settings, then http://127.0.0.1:5000 to chat. Chat with Aira. Press "Feedback" to test it.

STEP 2 - Choose a free online AI (needed so everyone can use it)
  Your laptop's Ollama cannot serve the public. Make a free account at Groq or Google AI Studio,
  create an API key, then edit .env:
     AI_BASE_URL = the service's OpenAI-compatible address (see .env.example)
     AI_API_KEY  = your key
     AI_MODEL    = a current model name from that service's dashboard (names change, so copy it from there)
  Restart python app.py and test again. Free plans have daily limits, so keep PER_DAY and GLOBAL_PER_DAY low at first.

STEP 3 - Put it online
  Use a Python host (Render, Railway, PythonAnywhere, etc.). Upload the files WITHOUT .env.
  Add the same settings in the host's "Environment variables" page, plus TRUST_PROXY=1.
  Start command:   gunicorn app:app --workers 1 --threads 8
  Feedback is saved in a small database file, so choose a plan with a persistent disk (or the data will be lost on restart).
  Set ADMIN_PASSWORD (long and unique) and read feedback at  https://YOUR-SITE/admin  (any username, that password).

STEP 4 - Instagram
  Instagram profile > Edit profile > Links > Add external link > paste your website address.

NEW FEATURES (all work after Step 1; nothing else to install except "pip install -r requirements.txt")
  - Login/Sign up + saved chats: the menu button (top left) shows saved chats. Logged-in people get their own daily limit (USER_PER_DAY).
    Nobody can reset a forgotten password by email. You can set a new one yourself:  python app.py setpassword their@email.com
  - Modes: Aira, Study helper, Coder, Friend, Website builder (dropdown above the message box).
  - Search web: appears only if the extra library is installed:  pip install ddgs  (then Aira searches DuckDuckGo and shows source links).
  - Photo: appears only when AI_VISION_MODEL is set to an AI model that can see images.
  - Website builder: choose the mode, describe a site, then press Preview or Download under the code.
  - Keep ADMIN_PASSWORD set; /admin also shows how many accounts exist.

Notes
  - Chats are stored only in each visitor's browser. The server stores only usage counts and feedback.
  - Never upload .env or share your API key.
  - privacy.html mentions you as the owner; edit the name if you want.
  - WHATSAPP_NUMBER is empty on purpose, add it only if you want your number public.
