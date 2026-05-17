# Fish Shell Skill

Use this skill whenever the user's shell is Fish. All shell commands provided to the user must use Fish syntax, not Bash/POSIX syntax.

## Core Concepts

Fish is intentionally not POSIX-compatible. It emphasizes commands over syntax — most string manipulation, math, and text processing uses builtin commands rather than arcane syntax.

## Variables

```fish
# Set variables with `set`, NOT `VAR=VAL`
set NAME value
set -g NAME value            # Global scope
set -l NAME value            # Local scope
set -gx NAME value           # Global + exported (like bash `export`)
set -U NAME value            # Universal (persists across sessions)

# Lists (all variables are lists)
set items foo bar baz
echo $items                  # prints all elements as separate args
echo $items[1]               # first element (1-indexed!)
echo $items[-1]              # last element
echo $items[2..3]            # range: elements 2-3

# Set to command output
set lines (cat file.txt)     # Each line is one list element

# Erase
set -e NAME

# Environment overrides (for one command)
VAR=VAL command

# Special variables
echo $status                 # Exit code of last command (bash $?)
echo $fish_pid               # Current PID (bash $$)
echo $last_pid               # PID of last background process (bash $!)
echo $argv                   # Script arguments (bash $@)
count $argv                  # Number of args (bash $#)
```

## Command Substitution

```fish
# Use (command) or $(command) — NOT backticks
echo (date)
for file in (ls *.txt)
    echo $file
end

# Split on nulls (safe for filenames)
for i in (find . -print0 | string split0)
    echo $i
end
```

## Command Equivalents

| Task                  | Bash                            | Fish                              |
| --------------------- | ------------------------------- | --------------------------------- |
| List files            | `ls -la`                        | `ls -la`                          |
| Find files            | `find . -name '*.rs'`           | Uses external `find` or globs     |
| Filter text           | `grep pattern`                  | `string match -r 'pattern'`       |
| Search in files       | `grep -r pattern dir/`          | `rg` (external) or `string match` |
| Replace in strings    | `sed 's/a/b/g'`                 | `string replace -a 'a' 'b'`       |
| String operations     | `${var#prefix}`                 | `string replace` or `string sub`  |
| Uppercase             | `tr '[:lower:]' '[:upper:]'`    | `string upper`                    |
| Lowercase             | `tr '[:upper:]' '[:lower:]'`    | `string lower`                    |
| Split string          | `IFS=, read -ra arr <<< "$str"` | `string split "," $str`           |
| Join strings          | `paste -sd,`                    | `string join "," $items`          |
| Count lines           | `wc -l`                         | `count $lines`                    |
| Math                  | `$((1 + 2))`                    | `math "1 + 2"`                    |
| Float math            | needs `bc`                      | `math "3.14 * 2"` (builtin!)      |
| Read file             | `cat file.txt`                  | `cat file.txt` (external cmd)     |
| Write file            | `echo "text" > f.txt`           | `echo "text" > f.txt`             |
| Append to file        | `echo "text" >> f.txt`          | `echo "text" >> f.txt`            |
| Process status        | `$?`                            | `$status` (0 = success)           |
| Get help              | `man cmd`                       | `cmd --help` or `man cmd`         |
| Source file           | `. file.sh`                     | `source file.fish`                |
| Check variable exists | `[[ -n $VAR ]]`                 | `set -q VAR`                      |

## Strings

```fish
# Replace
string replace "old" "new" "hello old world"
string replace -a "o" "O" "hello world"    # Replace all

# Match/regex
string match -r '^\d+$' "123"
echo "hello" | string match -r 'ell'

# Split/join
string split "," "a,b,c"
string join "," a b c

# Case
string upper "hello"        # => HELLO
string lower "HELLO"        # => hello

# Trim/pad
string trim "  hello  "
string pad -c x -w 20 "hello"

# Substring
string sub -s 1 -l 5 "hello world"    # Start at 1, length 5
# Or: string sub --start 1 --length 5

# Length/width
string length "hello"
string length --visible "héllo"       # Visible width (terminal cells)

# Escape
string escape "text with $pecial"
```

## Math (Arithmetic)

```fish
# Use `math` instead of $((...))
math "1 + 2"
math "3.14 * 2"
math "sin(0.5)"
math "log(100)"

# Store result
set result (math "10 / 3")
echo $result                    # 3.333333...

# Use in conditionals
if test (math "$count % 2") -eq 0
    echo even
end

# Note: * must be quoted (or use x for multiplication)
math "3 * 4"           # OK (quoted)
math 3 x 4             # OK (x for multiply)
# math 3 * 4           # ERROR: * expands as glob
```

## Control Flow

```fish
# If/else — no `then`, ends with `end`
if test -f "config.fish"
    echo "Found config"
else if test -f "config.local.fish"
    echo "Found local config"
else
    echo "No config found"
end

# For loop — no `do`, ends with `end`
for file in (ls *.txt)
    echo "Processing $file"
end

# While loop
while true
    echo "Running..."
    sleep 1
end

# Switch/case
switch $color
    case red
        echo "Stop"
    case yellow
        echo "Caution"
    case green
        echo "Go"
    case '*'
        echo "Unknown"
end

# Logical operators
command1; and command2     # Run cmd2 only if cmd1 succeeds
command1; or command2      # Run cmd2 only if cmd1 fails
not command                # Negate

# Begin/end block (like bash { ... })
begin
    command1
    command2
end | grep something
```

## Functions

```fish
# Define with `function ... end`
function greet
    echo "Hello, $argv[1]!"
end

# With arguments
function greet -a name
    echo "Hello, $name!"
end

# With description (for autocomplete)
function greet --description "Greet someone"
    echo "Hello, $argv!"
end

# Argparse for option parsing
function mycmd
    argparse 'n/name=' 'v/verbose' -- $argv
    or return

    if set -q _flag_verbose
        echo "Verbose mode"
    end
    if set -q _flag_name
        echo "Name: $_flag_name"
    end
end
mycmd --name Alice -v
```

## Process Substitution

```fish
# Instead of bash <(command), use `psub`
diff (command1 | psub) (command2 | psub)

# No equivalent to bash >(command)
# Use pipes instead
```

## Heredocs (Not Supported)

```fish
# Fish does NOT have <<EOF heredocs. Use alternatives:

# Multi-line string with quotes
echo "line 1
line 2
line 3"

# Or with printf
printf '%s\n' "line 1" "line 2" "line 3"

# Pipe content to a command
echo "xterm
rxvt-unicode" | pacman --remove -
```

## Wildcards (Globs)

```fish
# * matches any string (non-recursive)
ls *.fish

# ** matches recursively
ls **/*.fish

# Globs fail if no match (like bash failglob)
# Except in for loops, set, and count (behaves like nullglob)

# No globbing on variables — use external find or string match
set files (find . -name '*.fish')
```

## Aliases and Abbreviations

```fish
# Alias (persistent with alias --save)
alias gs "git status"
alias gc "git commit"

# Save for future sessions
alias --save gs "git status"

# Abbreviations (expand on space/enter at command line)
abbr --add gs git status
```

## Common Patterns

```fish
# Process files
for f in *.txt
    echo "Processing $f"
    string replace "foo" "bar" < $f > $f.new
end

# Check command success
if command
    echo "Success"
else
    echo "Failed with status $status"
end

# Safe count of lines
set lines (cat file.txt | count)
# or
count (cat file.txt)

# Loop with index
set items a b c
set i 1
for item in $items
    echo "$i: $item"
    set i (math "$i + 1")
end

# Pipe to while read (no subshell!)
echo -e "a\nb\nc" | while read -l line
    echo "Got: $line"
end

# Background job
long_running_command &
echo "PID: $last_pid"
```

## Key Gotchas

1. **`=` is not for assignment** — use `set NAME value`, NOT `NAME=value`
2. **No `&&` / `||`** — use `; and` / `; or` (note the semicolon!)
3. **No `$((...))`** — use `math "expression"`
4. **No `${var#prefix}` etc.** — use `string` builtin
5. **No backtick command substitution** — use `(command)` or `$(command)`
6. **No word splitting** — variables keep their values intact
7. **No `[[` or `((`** — use `test` or `[` (POSIX)
8. **Conditional chaining needs semicolons** — `cmd; and cmd2` not `cmd && cmd2`
9. **List indices are 1-based** — `$list[1]` is the first element
10. **No subshells** — variables set in pipes/loops are visible outside
11. **No heredocs** — use `echo "multi\nline"` or `printf`
12. **Functions end with `end`**, not `}`
