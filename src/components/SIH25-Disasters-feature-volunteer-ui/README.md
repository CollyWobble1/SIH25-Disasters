# SIH Disaster-Response Volunteer Mobile Application Prototype

> **Mobile-First Disaster Response Volunteer Platform**  
> Designed for Smart India Hackathon (SIH) — Rapid Emergency Volunteer Dispatch & Offline Tactical Synchronization.

---

## 🌟 Core Product Concept

In real disaster management, pre-assigning rigid tasks to volunteers before they arrive causes confusion. This application implements the authentic field response paradigm:

1. **VOLUNTEER CHOOSES WHERE TO HELP** (Selects an affected response zone based on location and proximity).
2. **SUPERVISOR DECIDES WHAT SPECIFIC TASK TO PERFORM** (On-site brief and operational assignment given by Response Team commanders upon physical arrival).

---

## 🚀 The 17-Step SIH Demonstration Flow

The application opens directly on the **Government Disaster Alert**:

1. **Step 1: Disaster Alert Screen** — The app opens directly to the official emergency broadcast.
2. **Step 2: Emergency Details** — Displays high-priority flood alert at *Wakad Response Zone (2.8 km away)*.
3. **Step 3: Call to Action** — *"Can you volunteer to help?"* with explicit choices: `YES, I WANT TO HELP` or `NOT NOW`.
4. **Step 4: Volunteer Consent** — Presenter taps `YES, I WANT TO HELP`.
5. **Step 5: Volunteer Interface** — Transitions with *"Thank you for volunteering"*.
6. **Step 6: Help Needed Nearby** — Displays nearby zones:
   - **Wakad Response Zone** (2.8 km, Flood emergency, 10 volunteers needed, HIGH priority)
   - **Ravet Relief Shelter** (4.1 km, Emergency assistance, 6 volunteers needed, CRITICAL priority)
   - **Punawale Response Zone** (3.6 km, Evacuation support, 15 volunteers needed, HIGH priority)
   - **Tathawade Relief Point** (5.2 km, Relief assistance, 8 volunteers needed, MEDIUM priority)
7. **Step 7: Location Selection** — Taps `VIEW` on *Wakad Response Zone*.
8. **Step 8: Location Details & Route Map** — Displays simulated route map and prominent notice:
   > *"Go to this location and meet the response supervisor or authorities. They will brief you and assign your specific task when you arrive."*
9. **Step 9: Commit to Location** — Taps `I CAN HELP HERE` (never "Accept Task").
10. **Step 10: Volunteer Confirmed** — Shows confirmed status and direction to proceed.
11. **Step 11: Navigation** — Taps `START NAVIGATION`.
12. **Step 12: Travelling State** — Status badge shows `TRAVELLING` with active path.
13. **Step 13: Arrival Action** — Reaches destination and taps top-right `I'M HERE` button.
14. **Step 14: Arrived State** — Status updates to `ARRIVED ✓` with recorded timestamp (e.g. `11:48 AM`).
15. **Step 15: Supervisor On-Site Message** — Direct field broadcast from *Response Team A* appears:
    > *"Meet us at the relief camp entrance. We will brief you on the assistance required."*
16. **Step 16: Task Assignment** — Specific operational task assigned on-site: **Evacuation Assistance** (`IN PROGRESS`, Assigned by *Response Team A*).
17. **Step 17: Completion** — Taps `MARK TASK COMPLETE`, views thank you note, and returns to nearby list.

---

## 📶 Offline Mesh Simulation & Authority Assignment

- **Offline Mode**: Tap the status pill in the top header (or use the SIH Presenter Bar) to toggle between `ONLINE` and `OFFLINE`.
  - Stored data remains fully interactive in local storage (*Saved locally*).
  - Restoring connectivity shows `Synchronizing...` followed by `✓ Synced`.
- **Authority Direct Assignment**: Presenter can click `Authority Assign` in the demo bar to simulate emergency command direct dispatch.

---

## 🛠️ Technology Stack & Running Locally

- **Runtime**: Vanilla ESM JavaScript + React architectural patterns.
- **Styling**: CSS Tokens, dynamic phone mockup, responsive touch viewport.
- **Server**: Run `python server.py` (or `npm run dev` with Vite).

```bash
# Run standalone local server
python server.py

# Or via npm/vite if Node.js is installed
npm run dev
```

Local demo address: **`http://localhost:3000`**
