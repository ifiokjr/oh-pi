# Nushell Skill

Use this skill whenever the user's shell is Nushell (nu). All shell commands provided to the user must use Nushell syntax, not Bash/POSIX syntax.

## Core Concepts

Nushell treats everything as structured data. Pipelines pass tables, lists, and records — not plain text. This is the single biggest difference from Bash.

## Variables

```nu
# Immutable (preferred)
let name = "world"
let files = (ls)                    # Parentheses for subexpressions
let big = (ls | where size > 10kb)

# Mutable
mut count = 0
$count += 1

# Constants (parse-time evaluation)
const config_dir = "~/.config"

# Environment variables — use $env.VAR, NOT $VAR
$env.PATH
$env.HOME
$env.PWD
let path = $env.PATH | append "/usr/local/bin"

# $in — the current pipeline input
[1 2 3] | $in.1                     # => 2
ls | $in | where size > 1mb
```

## Commands (not like Bash)

Nushell has **structured commands**, not text-processing tools:

| Task                   | Bash                   | Nushell                                                                          |
| ---------------------- | ---------------------- | -------------------------------------------------------------------------------- |
| List files             | `ls -la`               | `ls` (already structured)                                                        |
| Long listing           | `ls -la`               | `ls -l` or `ls --long`                                                           |
| Find files recursively | `find . -name '*.rs'`  | `ls **/*.rs`                                                                     |
| Filter by condition    | `grep pattern`         | `where name =~ "pattern"` or `find "text"`                                       |
| Sort                   | `sort`                 | `sort-by size`                                                                   |
| Take first N           | `head -5`              | `first 5`                                                                        |
| Take last N            | `tail -3`              | `last 3`                                                                         |
| Skip N                 | `tail -n +5`           | `skip 4`                                                                         |
| Read file              | `cat file.txt`         | `open file.txt` or `open --raw file.txt`                                         |
| Write file             | `echo "text" > f.txt`  | `"text" \| save f.txt`                                                           |
| Append to file         | `echo "text" >> f.txt` | `"text" \| save --append f.txt`                                                  |
| Parse CSV              | complex                | `open data.csv` (auto-detects)                                                   |
| Parse JSON             | `jq`                   | `open data.json` (auto-detects)                                                  |
| Count lines            | `wc -l`                | `length`                                                                         |
| Search in files        | `grep -r pattern dir/` | `rg` (via `^rg`) or `ls **/*.rs \| where (open $in.name \| str contains "TODO")` |
| Replace in strings     | `sed 's/a/b/g'`        | `str replace --all 'a' 'b'`                                                      |
| Parse date             | `date -d "..."`        | `"2024-01-01" \| into datetime`                                                  |
| Get help               | `man cmd`              | `help cmd` or `help commands \| find substring`                                  |

## Pipelines

```nu
# Data flows left to right as structured values
ls | where type == dir | sort-by modified | first 5

# Multi-line pipelines in parentheses
let result = (
    ls
    | where size > 10kb
    | sort-by name
    | select name size
)

# Chaining: use ; (not &&)
cmd1; cmd2                          # Sequential, no output piping between them
cmd1; cmd2 | cmd3                   # cmd1 runs, output discarded; cmd2 pipes to cmd3

# Logical chaining uses and/or (not &&/||)
cmd1 and cmd2                       # Run cmd2 only if cmd1 succeeds
cmd1 or cmd2                        # Run cmd2 only if cmd1 fails
```

## Tables and Data

```nu
# Create a table inline
[[name, size]; [file1.txt, 100] [file2.txt, 200]]

# Select columns
ls | select name size modified

# Reject (drop) columns
ls | reject type

# Filter rows
ls | where size > 1mb and type == file
ls | where name =~ "\.rs$"          # Regex match
ls | where name starts-with "D"

# Sort
ls | sort-by size --reverse

# Iterate over rows
ls | each { |file| $"($file.name) is ($file.size)" }
ls | each { |it| $it.name }         # Shorthand: $it is the current item

# Access nested data with dots
{ a: { b: 3 } } | get a.b           # => 3
ls | get name.0                      # First filename

# Update/add record fields
{ name: "nu", stars: 5 } | upsert language "Rust"

# Merge records
{ a: 1 } | merge { b: 2 }           # => { a: 1, b: 2 }
```

## Strings

```nu
# Interpolation — use $"..." with () placeholders
let name = "Alice"
$"Hello, ($name)!"                  # => Hello, Alice!

# Concatenate
"Hello " + "World"

# Split
"a,b,c" | split row ","             # => [a, b, c]

# Join
[a b c] | str join ","              # => a,b,c

# Replace
"hello world" | str replace "world" "nushell"
"hello world" | str replace --all 'l' 'L'

# Contains
"hello" | str contains "ell"        # => true

# Substring
"Hello World!" | str substring 4..8 # => o Wo

# Parse into columns
"Nushell 0.98" | parse "{shell} {version}"

# Uppercase/lowercase
"hello" | str upcase                # => HELLO
```

## Lists

```nu
# Create
[1, 2, 3]
1..10                               # Range: 1,2,3,...,10

# Access by index
let lst = [a b c]
$lst.0                              # => a
$lst.-1                             # => c (last element)

# Modify (creates new lists — immutable)
[1, 2, 3] | insert 1 99             # Insert at index
[1, 2, 3] | update 1 99            # Replace at index
[1, 2, 3] | prepend 0              # Add to front
[1, 2, 3] | append 4               # Add to end
[1, 2, 3] | drop 1                  # Remove at index

# Iterate
[1, 2, 3] | each { |n| $n * 2 }    # => [2, 4, 6]
[1, 2, 3] | each { $in * 2 }       # Same, using $in

# Map with index
[a b c] | enumerate | each { |it| $"($it.index): ($it.item)" }

# Reduce
[3, 8, 4] | reduce { |it, acc| $acc + $it }  # => 15
[3, 8, 4] | reduce --fold 1 { |it, acc| $acc * $it }  # => 96

# Test elements
[1, 2, 3] | any { $in > 2 }         # => true
[1, 2, 3] | all { $in > 0 }         # => true

# Length
[1, 2, 3] | length                  # => 3
```

## Custom Commands (Functions)

```nu
# Basic command
def greet [name: string] {
    $"hello ($name)"
}

# With default value
def greet [name = "nushell"] {
    $"hello ($name)"
}

# Typed parameters
def double [x: int]: int {
    $x * 2
}

# Flags
def greet [
    name: string
    --age: int          # Optional flag with value
    --verbose (-v)      # Shorthand flag (-v)
] {
    # body
}
greet "Alice" --age 30
greet "Bob" -v

# Rest parameters (variadic)
def multi [...names: string] {
    $names | each { $"Hello ($in)" }
}
multi Alice Bob Carol

# Pipeline input in custom commands
def my_filter [] {
    let data = $in                   # Capture pipeline input
    $data | where size > 1mb
}
ls | my_filter
```

## Modules

```nu
# Define inline
module greetings {
    export def hello [] { "hello" }
}
use greetings
greetings hello                     # Subcommand style

# From file
use path/to/module.nu
```

## External Commands

```nu
# Run external commands with ^ prefix
^git status
^cargo build --release
^rg "TODO" src/

# Capture external command output (returns raw string)
let output = (^git branch | lines)
let status = (^git status --porcelain)

# Pipe through external commands
ls | get name | to text | ^grep ".rs"

# Discard output
^noisy-command | ignore
```

## Control Flow

```nu
# If/else — must produce same type from both branches
if $condition {
    "yes"
} else {
    "no"
}

# For loops
for file in (ls) {
    print $"Processing ($file.name)"
}

# While
while $count < 10 {
    $count += 1
}

# Try/catch
try {
    risky-command
} catch { |err|
    print $"Failed: ($err.msg)"
}
```

## Common Patterns

```nu
# Process all files matching a pattern
ls **/*.rs | each { |file|
    print $"Linting ($file.name)"
    ^rustfmt $file.name
}

# Count lines of code (approximate)
ls **/*.rs | each { open --raw $in.name | lines | length } | math sum

# Find recently modified files
ls **/* | where modified > (date now) - 1day

# Convert JSON to CSV
open data.json | to csv | save data.csv

# Parse log files
open access.log | lines | parse "{ip} - - [{date}] \"{method} {path}\" {status} {size}"
```

## Key Gotchas

1. **No `&&` or `||`** — use `;`, `and`, `or`
2. **No `$VAR` for env vars** — use `$env.VAR`
3. **No `grep`/`sed`/`awk`** — use `where`, `str replace`, `each`
4. **`ls` returns a table**, not text — filter with `where`, not `grep`
5. **`open` is for reading files** — use `open file.txt` not `cat file.txt`
6. **Closures can't capture `mut` variables** — use immutable `let` inside closures
7. **External commands need `^` prefix** — `^git` not just `git`
8. **No `$(cmd)` substitution** — use `(cmd)` directly in expressions
9. **No backtick command substitution** — use `(cmd)`
10. **No `fi`/`done`/`esac`** — just `{ }` blocks
11. **`rm` is safer** — no `rm -rf` needed, just `rm -r`
12. **`$in` refers to pipeline input** — very useful for chaining
