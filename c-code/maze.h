#ifndef MAZE_H
#define MAZE_H

/* Maze generation and shortest-path functions exported to JavaScript. */
int generate_maze(int size, unsigned int seed);
int get_cell(int row, int col);
int find_path(int size, int start_row, int start_col, int target_row, int target_col);
int get_path_row(int index);
int get_path_col(int index);
int get_explored_count(void);

#endif
