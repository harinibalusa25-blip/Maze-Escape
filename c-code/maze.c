#include "maze.h"
#include <stdint.h>

#define MAX_SIZE 101
#define MAX_CELLS (MAX_SIZE * MAX_SIZE)
#define WALL 1
#define OPEN 0

typedef struct {
    int row;
    int col;
} Cell;

/* Static arrays keep the interface simple for JavaScript/WebAssembly. */
static int maze[MAX_SIZE][MAX_SIZE];
static Cell dfs_stack[MAX_CELLS];
static int path_rows[MAX_CELLS];
static int path_cols[MAX_CELLS];
static int path_length = 0;
static int explored_count = 0;

static uint32_t random_state = 1;

static uint32_t next_random(void) {
    /* xorshift32 pseudo-random generator */
    random_state ^= random_state << 13;
    random_state ^= random_state >> 17;
    random_state ^= random_state << 5;
    return random_state;
}

static int random_below(int limit) {
    return (int)(next_random() % (uint32_t)limit);
}

int generate_maze(int size, unsigned int seed) {
    if (size < 5 || size > MAX_SIZE || size % 2 == 0) {
        return 0;
    }

    random_state = seed == 0 ? 1u : (uint32_t)seed;

    for (int r = 0; r < size; r++) {
        for (int c = 0; c < size; c++) {
            maze[r][c] = WALL;
        }
    }

    int top = 0;
    dfs_stack[top++] = (Cell){1, 1};
    maze[1][1] = OPEN;

    /* Iterative depth-first search using an explicit stack. */
    const int dr[4] = {-2, 2, 0, 0};
    const int dc[4] = {0, 0, -2, 2};

    while (top > 0) {
        Cell current = dfs_stack[top - 1];
        int directions[4] = {0, 1, 2, 3};

        /* Shuffle directions so each generated maze is different. */
        for (int i = 3; i > 0; i--) {
            int j = random_below(i + 1);
            int temp = directions[i];
            directions[i] = directions[j];
            directions[j] = temp;
        }

        int moved = 0;
        for (int i = 0; i < 4; i++) {
            int direction = directions[i];
            int nr = current.row + dr[direction];
            int nc = current.col + dc[direction];

            if (nr > 0 && nr < size - 1 && nc > 0 && nc < size - 1 && maze[nr][nc] == WALL) {
                maze[current.row + dr[direction] / 2][current.col + dc[direction] / 2] = OPEN;
                maze[nr][nc] = OPEN;
                dfs_stack[top++] = (Cell){nr, nc};
                moved = 1;
                break;
            }
        }

        if (!moved) {
            top--;
        }
    }

    path_length = 0;
    explored_count = 0;
    return 1;
}

int get_cell(int row, int col) {
    if (row < 0 || col < 0 || row >= MAX_SIZE || col >= MAX_SIZE) {
        return WALL;
    }
    return maze[row][col];
}

int find_path(int size, int start_row, int start_col, int target_row, int target_col) {
    if (size < 1 || size > MAX_SIZE ||
        start_row < 0 || start_col < 0 || target_row < 0 || target_col < 0 ||
        start_row >= size || start_col >= size || target_row >= size || target_col >= size ||
        maze[start_row][start_col] == WALL || maze[target_row][target_col] == WALL) {
        path_length = 0;
        explored_count = 0;
        return 0;
    }

    int visited[MAX_CELLS] = {0};
    int parent[MAX_CELLS];
    int queue[MAX_CELLS];
    int total = size * size;

    for (int i = 0; i < total; i++) {
        parent[i] = -1;
    }

    int start = start_row * size + start_col;
    int target = target_row * size + target_col;
    int front = 0;
    int back = 0;

    queue[back++] = start;
    visited[start] = 1;
    explored_count = 0;
    path_length = 0;

    const int dr[4] = {-1, 1, 0, 0};
    const int dc[4] = {0, 0, -1, 1};

    /* Breadth-first search using a queue. */
    while (front < back) {
        int current = queue[front++];
        explored_count++;

        if (current == target) {
            break;
        }

        int row = current / size;
        int col = current % size;

        for (int d = 0; d < 4; d++) {
            int nr = row + dr[d];
            int nc = col + dc[d];

            if (nr >= 0 && nr < size && nc >= 0 && nc < size && maze[nr][nc] == OPEN) {
                int next = nr * size + nc;
                if (!visited[next]) {
                    visited[next] = 1;
                    parent[next] = current;
                    queue[back++] = next;
                }
            }
        }
    }

    if (!visited[target]) {
        return 0;
    }

    /* Reconstruct the path from target to start, then reverse it. */
    int reverse_path[MAX_CELLS];
    int count = 0;
    for (int cell = target; cell != -1 && count < MAX_CELLS; cell = parent[cell]) {
        reverse_path[count++] = cell;
        if (cell == start) break;
    }

    if (count == 0 || reverse_path[count - 1] != start) {
        path_length = 0;
        return 0;
    }

    path_length = count;
    for (int i = 0; i < count; i++) {
        int cell = reverse_path[count - 1 - i];
        path_rows[i] = cell / size;
        path_cols[i] = cell % size;
    }

    return path_length;
}

int get_path_row(int index) {
    if (index < 0 || index >= path_length) return -1;
    return path_rows[index];
}

int get_path_col(int index) {
    if (index < 0 || index >= path_length) return -1;
    return path_cols[index];
}

int get_explored_count(void) {
    return explored_count;
}
