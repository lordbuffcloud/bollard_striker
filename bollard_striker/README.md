# Bollard Striker Game 🚗💥

![Bollard Strike Logo](./bollard.png)

## 🛑 What's Bollard Striker? 

**Bollard Striker** is your chance to experience what happens when you’re “one of them” who isn’t paying attention and smacks straight into a bollard. Yeah, you know the ones—the short poles that somehow manage to sneak up on you and ruin everyone’s day (especially Security Forces). This game is a tongue-in-cheek look at a super common headache for the SF folks at Wright Pat, so I thought we’d have some fun with it! 🙃

## 🎯 How to Play

- **Avoid** the bollards. (Too easy, right? 😂)
- **Move** left and right using the arrow keys. It’s that simple.
- Try **not to die**. You get 3 chances. Use them wisely.
- Enter your **name** and see how you stack up on the leaderboard. Are you the worst bollard dodger? Or the least worst?

## Why Did I Make This? 

Because *bollard strikes* are a thing. Like, a everyday thing. Drivers hitting those poor defenseless bollards are a Security Forces nightmare. But hey, we thought we’d make it fun and let you see if you can avoid the same fate. Spoiler: You probably can’t. 😉

## 🚗 How to Get Started

1. Clone the game (or, y'know, just download it):
    ```bash
    git clone https://github.com/yourusername/bollard_striker.git
    ```

2. Go into the game folder:
    ```bash
    cd bollard_striker
    ```

3. Set up your virtual environment like a pro:
    ```bash
    python -m venv venv
    .venv/scripts/activate 
    ```

4. Install all the good stuff:
    ```bash
    pip install -r requirements.txt
    ```

5. Run it and show those bollards who's boss:
    ```bash
    python bollard_striker.py
    ```

## 🎮 Game Features (aka, Why This Game is 🔥)

- **Bollard dodging action** that Security Forces only wish was this fun in real life. Better issue that 1805 and have that report by EOD troop!
- **Leaderboard** to flex your skills (or lack thereof) by entering your name.
- The sweet satisfaction of not hitting them bollards.

## 🤖 Dev Stuff

1. **Pygame** runs this bad boy (because Pygame makes everything better).
2. Files like `visitor.png`, `bollard.png`, and `leaderboard.json` are included, because we got your back.
3. If you break it, it’s probably your fault. 😜 Just kidding, submit a pull request and let’s fix it together.

## 📊 Leaderboard

We keep track of who’s the best at *not* slamming into bollards. At the end of each game, you’ll be asked to input your name so you can cement your legacy (or your eternal shame). Only the greatest—or worst—shall be remembered.

## Requirements

- **Python 3.6+**
- **Pygame 2.x**
- Fingers capable of pressing left and right keys 


## 🙌 Contribute

Feel like making the game even more ridiculous? Fork the repo and send in your meme-worthy improvements. We’re always open to new ways to make bollard dodging hilarious.

---
# bollard_striker

---

## 🌐 Web Version (Deploy on Vercel)

This repo now includes a browser version you can host anywhere, including Vercel.

### Run locally

You can open `index.html` directly, or serve the folder with any static server:

```bash
npx serve .
```

### Deploy to Vercel

1. Install the Vercel CLI and log in:

```bash
npm i -g vercel
vercel login
```

2. From the project root, deploy:

```bash
vercel --prod
```

Vercel will serve `index.html` at the root and all assets under `bollard_striker/`.
