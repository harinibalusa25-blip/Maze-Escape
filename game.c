
#include <stdlib.h>

#define MAX_CELLS 2500

/*
 * Finds a shortest path through a maze using BFS.
 * maze: 0 = open cell, 1 = wall
 * path: output cell indices, from start to goal
 * Returns the number of cells in the path, or 0 if none exists.
 */
int find_path_c(
    const int *maze,
    int rows,
    int cols,
    int start,
    int goal,
    int *path
) {
    if (!maze || !path || rows <= 0 || cols <= 0)
        return 0;

    int total = rows * cols;

    if (total > MAX_CELLS ||
        start < 0 || start >= total ||
        goal < 0 || goal >= total)
        return 0;

    if (maze[start] || maze[goal])
        return 0;

    int queue[MAX_CELLS];
    int parent[MAX_CELLS];
    int visited[MAX_CELLS] = {0};

    for (int i = 0; i < total; i++)
        parent[i] = -1;

    int head = 0, tail = 0;
    queue[tail++] = start;
    visited[start] = 1;

    const int dr[] = {-1, 1, 0, 0};
    const int dc[] = {0, 0, -1, 1};

    while (head < tail) {
        int current = queue[head++];

        if (current == goal)
            break;

        int r = current / cols;
        int c = current % cols;

        for (int d = 0; d < 4; d++) {
            int nr = r + dr[d];
            int nc = c + dc[d];

            if (nr < 0 || nr >= rows ||
                nc < 0 || nc >= cols)
                continue;

            int next = nr * cols + nc;

            if (maze[next] || visited[next])
                continue;

            visited[next] = 1;
            parent[next] = current;
            queue[tail++] = next;
        }
    }

    if (!visited[goal])
        return 0;

    int count = 0;

    for (int at = goal; at != -1; at = parent[at])
        path[count++] = at;

    for (int i = 0; i < count / 2; i++) {
        int temp = path[i];
        path[i] = path[count - 1 - i];
        path[count - 1 - i] = temp;
    }

    return count;
}
