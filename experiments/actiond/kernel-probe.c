// Minimal regression probe for V8's failing DiscardSystemPages call.
#define _GNU_SOURCE
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/mman.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc != 2) return 2;
  long size = sysconf(_SC_PAGESIZE);
  void *memory = mmap(NULL, size, PROT_NONE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
  if (memory == MAP_FAILED) { perror("mmap"); return 1; }
  int result = madvise(memory, size, MADV_DONTNEED);
  int failure = errno;
  munmap(memory, size);
  if (result != 0) {
    fprintf(stderr, "madvise(MADV_DONTNEED): errno=%d (%s)\n", failure, strerror(failure));
    return 1;
  }
  FILE *output = fopen(argv[1], "w");
  if (!output) { perror("output"); return 1; }
  fputs("madvise(MADV_DONTNEED) succeeded\n", output);
  return fclose(output) != 0;
}
