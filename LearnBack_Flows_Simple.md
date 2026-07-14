# LearnBack: How It Works (Simple Flows)

Welcome to LearnBack! This document breaks down the four main flows of the platform in simple, non-technical terms. If you want to understand exactly what happens behind the scenes when you use the app, you're in the right place.

---

## 1. The Overall Flow (The Big Picture)

This is the journey you take from the moment you log in to the moment you finish studying a topic.

* **Step 1: Uploading Your Material.** You drag and drop your lecture slides or notes (PDFs) into the app. 
* **Step 2: Smart Chunking.** Behind the scenes, LearnBack reads your document and automatically breaks it down into a neat "Syllabus" of small, digestible topics and concepts.
* **Step 3: The Teaching Session.** You enter the chat room. You don't get quizzed with multiple-choice questions. Instead, you meet **Kido**, an AI student. Kido asks *you* to explain the first concept on the syllabus.
* **Step 4: Real-time Feedback.** You type out your explanation. LearnBack instantly checks your answer, updates your progress, and Kido replies. If you're right, Kido learns. If you're wrong, Kido asks clarifying questions to help you figure out your mistake.
* **Step 5: The Mind Map Check.** Once you finish a topic, Kido builds a "Mind Map" summarizing what they learned from you. You get to review it. If Kido misunderstood something, it means your explanation wasn't clear enough, and you can correct it!
* **Step 6: Dashboard.** When the session ends, you get a beautiful dashboard showing exactly what you've mastered and what concepts you need to review again.

---

## 2. The BKT Flow: How Progress is Calculated

BKT (Bayesian Knowledge Tracing) sounds complicated, but it's just the engine that powers your **invisible progress bar**.

* **The Concept:** Traditional tests just give you a flat grade like "80%". LearnBack treats learning like a hidden state. We assume you either *know* a concept or you *don't*, and we use every chat message you send as a clue to figure it out.
* **Starting Out:** Every time you start a new concept, the system assumes you have a low chance of knowing it (around 30%).
* **Moving Up:** When you explain something correctly to Kido, the system does some math and increases your "Mastery Score." 
* **Moving Down:** If you explain something incorrectly or have a misconception, your Mastery Score goes down.
* **Mastery Threshold:** Once your score crosses the **85% mark**, the system officially declares that you have "Mastered" the concept. The progress bar turns green, and Kido moves on to the next topic.
* **Why it matters:** It means you can't just guess your way through. The system mathematically ensures you actually understand a concept before letting you move forward.

---

## 3. The "Judge" Evaluator: The Silent Grader

While you are chatting with Kido, there is actually a second, invisible AI watching everything. This is the **Judge**.

* **The Setup:** The Judge knows the exact "textbook" definition of the concept you are supposed to be teaching.
* **The Evaluation:** Every time you hit send, your message goes to the Judge first. The Judge asks three questions:
  1. *Is this correct?*
  2. *Is this complete, or is it too shallow?*
  3. *Did they accidentally mix up any terms (a misconception)?*
* **Passing Notes:** The Judge then secretly passes a note to Kido and the BKT engine. 
  * If you were right, the Judge tells the BKT engine to boost your score, and tells Kido to act happy.
  * If you were wrong, the Judge flags your specific mistake, drops your score, and tells Kido to act confused about that specific mistake.

---

## 4. The Kido Character: Your AI Student

Kido is the face of the app and the core of the "Learn by Teaching" philosophy. 

* **The Persona:** Kido is not a super-smart AI assistant like ChatGPT. Kido is a cheerful, eager-to-learn student who knows absolutely nothing about your subject. 
* **The Rule:** Kido will *never* break character. If you try to ask Kido to write an essay for you, Kido will just get confused and say, "Wait, I'm the student! I thought you were going to teach me!"
* **Reactions to the Judge:**
  * **When you are right:** Kido celebrates, acts excited, and might repeat back what you said to show they understand.
  * **When you are wrong:** Kido never says "You are wrong. Here is the correct answer." Instead, Kido acts confused. They might say, "Wait, I thought gravity pulls things down, not pushes them up? Can you clarify?" This forces *you* to realize your own mistake and fix it.
* **When you get stuck:** If you struggle and get a concept wrong 3 times in a row, Kido will gently step in to give you a strong hint or suggest you review your slides, so you never get frustrated or stuck in an endless loop.
