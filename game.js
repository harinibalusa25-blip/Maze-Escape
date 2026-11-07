"use strict";

// MAZE ESCAPE — Browser prototype
const $ = (id) => document.getElementById(id);

// ==========================================
// BACKGROUND MUSIC CONTROLS
// ==========================================

const backgroundMusic = $("backgroundMusic");
const musicBtn = $("musicBtn");

if (backgroundMusic && musicBtn) {
  backgroundMusic.volume = 0.25;

  musicBtn.addEventListener("click", async () => {
    if (backgroundMusic.paused) {
      try {
        await backgroundMusic.play();
        musicBtn.textContent = "♫ Music: On";
        musicBtn.setAttribute("aria-pressed", "true");
      } catch (error) {
        console.error("Music playback failed:", error);
        alert("Could not play music. Check audio/adventure.mp3.");
      }
    } else {
      backgroundMusic.pause();
      musicBtn.textContent = "♫ Music: Off";
      musicBtn.setAttribute("aria-pressed", "false");
    }
  });

  backgroundMusic.addEventListener("pause", () => {
    musicBtn.textContent = "♫ Music: Off";
    musicBtn.setAttribute("aria-pressed", "false");
  });

  backgroundMusic.addEventListener("play", () => {
    musicBtn.textContent = "♫ Music: On";
    musicBtn.setAttribute("aria-pressed", "true");
  });
}

// ==========================================
// C WEBASSEMBLY MODULE
// ==========================================

let cModule = null;

const cModulePromise = createMazeModule().then(module => {
  cModule = module;
  console.log("C WebAssembly module loaded successfully!");
  return module;
});

// ==========================================
// GAME CONFIGURATION
// ==========================================

const screens = [
  "menuScreen",
  "levelsScreen",
  "gameScreen",
  "pauseScreen",
  "resultScreen"
];

const levels = [
  { name: "Explorer", size: 11, coins: 4, traps: 0, enemy: false },
  { name: "Locked Labyrinth", size: 15, coins: 7, traps: 1, enemy: false },
  { name: "Trap Zone", size: 19, coins: 9, traps: 5, enemy: false },
  { name: "The Hunter", size: 23, coins: 12, traps: 5, enemy: true },
  { name: "Nightmare", size: 27, coins: 16, traps: 9, enemy: true }
];

const canvas = $("mazeCanvas");
const ctx = canvas.getContext("2d");

// ==========================================
// GAME VARIABLES
// ==========================================

let levelIndex = 0;

let maze, player, exitCell, coins, traps, enemy, hintPath;

let moves = 0;
let lives = 3;
let collected = 0;
let elapsed = 0;

let startedAt = 0;
let pausedAt = 0;
let pauseTotal = 0;

let paused = false;
let finished = false;
let hintVisible = false;

let enemyStep = 0;
let enemyAccumulator = 0;

let lastFrame = performance.now();

// ==========================================
// SCREEN MANAGEMENT
// ==========================================

function showScreen(id) {
  screens.forEach(screen => {
    $(screen).classList.add("hidden");
  });

  $(id).classList.remove("hidden");
}

// ==========================================
// SHUFFLE FUNCTION
// ==========================================

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

// ==========================================
// MAZE GENERATION USING C
// ==========================================

function generateMaze(size) {
  const seed = Math.floor(Math.random() * 0xFFFFFFFF) >>> 0;

  const success = cModule._generate_maze(size, seed);

  if (!success) {
    throw new Error("C maze generation failed");
  }

  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) =>
      cModule._get_cell(r, c)
    )
  );
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function key(r, c) {
  return `${r},${c}`;
}

function same(a, b) {
  return a.r === b.r && a.c === b.c;
}

function walkable(r, c) {
  return !!maze[r] && maze[r][c] === 0;
}

// ==========================================
// SHORTEST PATH USING C BFS
// ==========================================

function findPath(start, target) {
  const length = cModule._find_path(
    maze.length,
    start.r,
    start.c,
    target.r,
    target.c
  );

  const path = [];

  for (let i = 0; i < length; i++) {
    path.push({
      r: cModule._get_path_row(i),
      c: cModule._get_path_col(i)
    });
  }

  return path;
}

// ==========================================
// RANDOM OPEN CELL
// ==========================================

function randomOpenCell(excluded) {
  const candidates = [];

  for (let r = 1; r < maze.length - 1; r++) {
    for (let c = 1; c < maze.length - 1; c++) {
      if (!walkable(r, c)) continue;
      if (excluded.has(key(r, c))) continue;

      candidates.push({ r, c });
    }
  }

  return candidates[
    Math.floor(Math.random() * candidates.length)
  ] || null;
}

// ==========================================
// START NEW GAME
// ==========================================

function newGame(index = levelIndex) {

  // Wait until WebAssembly loads
  if (!cModule) {
    cModulePromise
      .then(() => newGame(index))
      .catch(error => {
        console.error(
          "Could not load the C WebAssembly module:",
          error
        );

        alert(
          "The maze engine could not load. Please refresh the page and try again."
        );
      });

    return;
  }

  levelIndex = index;

  const level = levels[levelIndex];

  maze = generateMaze(level.size);

  player = { r: 1, c: 1 };

  exitCell = {
    r: level.size - 2,
    c: level.size - 2
  };

  moves = 0;
  lives = 3;
  collected = 0;
  elapsed = 0;

  pauseTotal = 0;
  paused = false;
  finished = false;
  hintVisible = false;

  hintPath = [];
  enemy = null;

  enemyStep = 0;
  enemyAccumulator = 0;

  const excluded = new Set([
    key(player.r, player.c),
    key(exitCell.r, exitCell.c)
  ]);

  // Place coins
  coins = [];

  for (let i = 0; i < level.coins; i++) {
    const cell = randomOpenCell(excluded);

    if (!cell) break;

    coins.push(cell);

    excluded.add(key(cell.r, cell.c));
  }

  // Place traps
  traps = [];

  for (let i = 0; i < level.traps; i++) {
    const cell = randomOpenCell(excluded);

    if (!cell) break;

    traps.push(cell);

    excluded.add(key(cell.r, cell.c));
  }

  // Place enemy
  if (level.enemy) {
    enemy = randomOpenCell(excluded);
  }

  startedAt = performance.now();
  lastFrame = startedAt;

  $("levelTitle").innerHTML =
    `Level ${String(index + 1).padStart(2, "0")} <span class="accent">/ ${level.name}</span>`;

  $("mazeSize").textContent =
    `${level.size} × ${level.size}`;

  $("hintMessage").textContent =
    "Hints reveal a route to the exit.";

  showScreen("gameScreen");

  resizeCanvas();
  updateHUD();
  drawMaze();
}

// ==========================================
// CANVAS RESIZING
// ==========================================

function resizeCanvas() {
  if (!$("gameScreen").classList.contains("hidden")) {

    const rect = canvas.getBoundingClientRect();

    if (!rect.width) return;

    const dpr = Math.min(
      window.devicePixelRatio || 1,
      2
    );

    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.width * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawMaze();
  }
}

// ==========================================
// UPDATE GAME HUD
// ==========================================

function updateHUD() {

  $("moves").textContent = moves;

  $("coins").textContent =
    `${collected} / ${levels[levelIndex].coins}`;

  $("lives").textContent =
    `${"♥ ".repeat(lives)}${"♡ ".repeat(3 - lives)}`.trim();

  $("timer").textContent = formatTime(elapsed);
}

// ==========================================
// FORMAT TIMER
// ==========================================

function formatTime(seconds) {
  const s = Math.floor(seconds);

  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// ==========================================
// DRAW MAZE
// ==========================================

function drawMaze() {

  if (!maze || canvas.width === 0) return;

  const rect = canvas.getBoundingClientRect();

  const size = rect.width;

  if (!size) return;

  const n = maze.length;

  const tile = size / n;

  ctx.clearRect(0, 0, size, size);

  ctx.fillStyle = "#11150f";

  ctx.fillRect(0, 0, size, size);

  // Walls and paths
  for (let r = 0; r < n; r++) {

    for (let c = 0; c < n; c++) {

      const x = c * tile;
      const y = r * tile;

      if (maze[r][c] === 1) {

        ctx.fillStyle = "#30392a";

        ctx.fillRect(
          x + 1,
          y + 1,
          tile - 2,
          tile - 2
        );

      } else {

        ctx.fillStyle = "#171c14";

        ctx.fillRect(x, y, tile, tile);
      }
    }
  }

  // Hint route
  if (hintVisible) {

    ctx.fillStyle = "rgba(198,243,107,0.25)";

    hintPath.forEach(p => {

      ctx.fillRect(
        p.c * tile + tile * .2,
        p.r * tile + tile * .2,
        tile * .6,
        tile * .6
      );
    });
  }

  // Coins
  coins.forEach(p => {

    ctx.beginPath();

    ctx.fillStyle = "#e5c56b";

    ctx.arc(
      (p.c + .5) * tile,
      (p.r + .5) * tile,
      tile * .19,
      0,
      Math.PI * 2
    );

    ctx.fill();
  });

  // Traps
  traps.forEach(p => {

    const x = (p.c + .5) * tile;
    const y = (p.r + .5) * tile;

    ctx.fillStyle = "#e87575";

    ctx.beginPath();

    ctx.moveTo(x, y - tile * .25);

    ctx.lineTo(
      x + tile * .23,
      y + tile * .2
    );

    ctx.lineTo(
      x - tile * .23,
      y + tile * .2
    );

    ctx.closePath();

    ctx.fill();
  });

  // Exit
  const ex = (exitCell.c + .5) * tile;
  const ey = (exitCell.r + .5) * tile;

  ctx.fillStyle = "#78c9a1";

  ctx.fillRect(
    ex - tile * .28,
    ey - tile * .28,
    tile * .56,
    tile * .56
  );

  ctx.fillStyle = "#171c14";

  ctx.fillRect(
    ex - tile * .12,
    ey - tile * .12,
    tile * .24,
    tile * .24
  );

  // Enemy
  if (enemy) {

    ctx.fillStyle = "#ee8a78";

    ctx.beginPath();

    ctx.arc(
      (enemy.c + .5) * tile,
      (enemy.r + .5) * tile,
      tile * .3,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }

  // Player
  ctx.fillStyle = "#c6f36b";

  ctx.beginPath();

  ctx.arc(
    (player.c + .5) * tile,
    (player.r + .5) * tile,
    tile * .31,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.fillStyle = "#202819";

  ctx.beginPath();

  ctx.arc(
    (player.c + .5) * tile,
    (player.r + .5) * tile,
    tile * .12,
    0,
    Math.PI * 2
  );

  ctx.fill();
}

// ==========================================
// PLAYER MOVEMENT
// ==========================================

function movePlayer(dr, dc) {

  if (paused || finished) return;

  const nr = player.r + dr;
  const nc = player.c + dc;

  if (!walkable(nr, nc)) return;

  player = { r: nr, c: nc };

  moves++;

  hintVisible = false;

  // Collect coin
  const coinIndex = coins.findIndex(
    p => same(p, player)
  );

  if (coinIndex !== -1) {

    coins.splice(coinIndex, 1);

    collected++;
  }

  // Trap collision
  const trapIndex = traps.findIndex(
    p => same(p, player)
  );

  if (trapIndex !== -1) {

    traps.splice(trapIndex, 1);

    lives--;

    if (lives <= 0) {

      updateHUD();
      drawMaze();

      finishGame(false);

      return;
    }
  }

  // Enemy collision
  if (enemy && same(player, enemy)) {

    lives--;

    if (lives <= 0) {

      updateHUD();
      drawMaze();

      finishGame(false);

      return;
    }

    enemy = {
      r: maze.length - 2,
      c: maze.length - 2
    };
  }

  updateHUD();

  drawMaze();

  if (same(player, exitCell)) {
    finishGame(true);
  }
}

// ==========================================
// SHOW SHORTEST PATH HINT
// ==========================================

function showHint() {

  if (paused || finished) return;

  hintPath = findPath(player, exitCell);

  hintVisible = hintPath.length > 0;

  $("hintMessage").textContent = hintVisible
    ? `Shortest remaining route: ${hintPath.length - 1} moves.`
    : "No route found.";

  drawMaze();
}

// ==========================================
// FINISH GAME
// ==========================================

function finishGame(won) {

  finished = true;

  const score = won
    ? Math.max(
        0,
        1000 + collected * 100 + lives * 150 -
        Math.floor(elapsed) * 2 - moves * 3
      )
    : Math.max(0, collected * 100);

  $("resultMark").textContent = won ? "✓" : "×";

  $("resultEyebrow").textContent =
    won ? "MISSION COMPLETE" : "MISSION FAILED";

  $("resultTitle").innerHTML = won
    ? 'You found your <span class="accent">way out.</span>'
    : 'The maze <span class="accent">wins this round.</span>';

  $("resultDescription").textContent = won
    ? "Every step brought you closer."
    : "Regroup, learn the route, and try again.";

  $("finalTime").textContent = formatTime(elapsed);

  $("finalMoves").textContent = moves;

  $("finalCoins").textContent = collected;

  $("finalScore").textContent = score;

  $("nextBtn").classList.toggle(
    "hidden",
    !won || levelIndex === levels.length - 1
  );

  showScreen("resultScreen");
}

// ==========================================
// PAUSE AND RESUME
// ==========================================

function togglePause() {

  if (finished) return;

  if (!paused) {

    paused = true;

    pausedAt = performance.now();

    showScreen("pauseScreen");

  } else {

    pauseTotal += performance.now() - pausedAt;

    paused = false;

    lastFrame = performance.now();

    showScreen("gameScreen");
  }
}

// ==========================================
// RESTART LEVEL
// ==========================================

function resetCurrentLevel() {
  newGame(levelIndex);
}

// ==========================================
// ENEMY MOVEMENT
// ==========================================

function updateEnemy(dt) {

  if (!enemy || paused || finished) return;

  enemyAccumulator += dt;

  if (enemyAccumulator < 0.45) return;

  enemyAccumulator = 0;

  const path = findPath(enemy, player);

  if (path.length > 1) {

    enemy = path[1];

    if (same(enemy, player)) {

      lives--;

      if (lives <= 0) {

        updateHUD();
        drawMaze();

        finishGame(false);

        return;
      }

      // Return player to starting cell
      player = { r: 1, c: 1 };
    }

    updateHUD();

    drawMaze();
  }
}

// ==========================================
// KEYBOARD CONTROLS
// ==========================================

window.addEventListener("keydown", e => {

  const keyName = e.key.toLowerCase();

  if (
    ["arrowup", "arrowdown", "arrowleft", "arrowright", " "]
      .includes(keyName)
  ) {
    e.preventDefault();
  }

  if (keyName === "escape") {

    if (
      !$("gameScreen").classList.contains("hidden") ||
      !$("pauseScreen").classList.contains("hidden")
    ) {
      togglePause();
    }

    return;
  }

  if (
    keyName === "h" &&
    !$("gameScreen").classList.contains("hidden")
  ) {
    showHint();
    return;
  }

  if (
    paused ||
    finished ||
    $("gameScreen").classList.contains("hidden")
  ) {
    return;
  }

  switch (keyName) {

    case "w":
    case "arrowup":
      movePlayer(-1, 0);
      break;

    case "s":
    case "arrowdown":
      movePlayer(1, 0);
      break;

    case "a":
    case "arrowleft":
      movePlayer(0, -1);
      break;

    case "d":
    case "arrowright":
      movePlayer(0, 1);
      break;
  }
});

// ==========================================
// BUTTONS AND NAVIGATION
// ==========================================

$("playBtn").addEventListener(
  "click",
  () => newGame(0)
);

$("levelsBtn").addEventListener(
  "click",
  () => showScreen("levelsScreen")
);

$("brandHome").addEventListener("click", e => {

  e.preventDefault();

  paused = false;

  showScreen("menuScreen");
});

document.querySelectorAll(".backBtn").forEach(btn => {

  btn.addEventListener(
    "click",
    () => showScreen("menuScreen")
  );
});

$("pauseBtn").addEventListener(
  "click",
  togglePause
);

$("resumeBtn").addEventListener(
  "click",
  togglePause
);

$("restartBtn").addEventListener(
  "click",
  resetCurrentLevel
);

$("pauseRestartBtn").addEventListener(
  "click",
  resetCurrentLevel
);

$("hintBtn").addEventListener(
  "click",
  showHint
);

$("pauseHomeBtn").addEventListener("click", () => {

  paused = false;

  showScreen("menuScreen");
});

$("resultHomeBtn").addEventListener(
  "click",
  () => showScreen("menuScreen")
);

$("replayBtn").addEventListener(
  "click",
  () => newGame(levelIndex)
);

$("nextBtn").addEventListener("click", () => {

  if (levelIndex < levels.length - 1) {
    newGame(levelIndex + 1);
  }
});

// ==========================================
// LEVEL SELECTION
// ==========================================

levels.forEach((level, i) => {

  const button = document.createElement("button");

  button.className = "level-card";

  button.innerHTML = `
    <span class="level-number">
      LEVEL ${String(i + 1).padStart(2, "0")}
    </span>

    <h3>${level.name}</h3>

    <p>
      ${level.size} × ${level.size} maze.
      ${level.enemy
        ? "An enemy is on the hunt."
        : "Explore and find the exit."}
    </p>

    <div class="level-meta">
      ${level.coins} COINS · ${level.traps} TRAPS
    </div>
  `;

  button.addEventListener(
    "click",
    () => newGame(i)
  );

  $("levelGrid").appendChild(button);
});

// ==========================================
// DECORATIVE MAZE ON HOME SCREEN
// ==========================================

(function createDecor() {

  const grid = $("decorGrid");

  for (let i = 0; i < 169; i++) {

    const cell = document.createElement("div");

    cell.className = "decor-cell";

    if (Math.random() > .53) {
      cell.classList.add("wall");
    }

    if ([0, 65, 130].includes(i)) {
      cell.classList.add("highlight");
    }

    grid.appendChild(cell);
  }

})();

// ==========================================
// MAIN ANIMATION AND UPDATE LOOP
// ==========================================

function frame(now) {

  const dt = Math.min(
    (now - lastFrame) / 1000,
    0.1
  );

  lastFrame = now;

  if (
    !paused &&
    !finished &&
    !$("gameScreen").classList.contains("hidden")
  ) {

    elapsed = Math.max(
      0,
      (now - startedAt - pauseTotal) / 1000
    );

    updateHUD();

    updateEnemy(dt);
  }

  requestAnimationFrame(frame);
}

// ==========================================
// INITIALIZATION
// ==========================================

window.addEventListener("resize", resizeCanvas);

requestAnimationFrame(frame);

showScreen("menuScreen");