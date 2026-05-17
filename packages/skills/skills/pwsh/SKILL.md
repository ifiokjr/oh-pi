# PowerShell Skill

Use this skill whenever the user's shell is PowerShell (pwsh). All commands must use PowerShell syntax — cmdlets, not Bash/POSIX syntax. PowerShell deals in **objects**, not plain text.

## Core Concepts

PowerShell passes objects through pipelines, not text. Every cmdlet outputs structured objects with properties and methods. This is the single biggest difference from Bash.

## Variables

```powershell
# All variables start with $
$name = "World"
$count = 42
$files = Get-ChildItem

# Environment variables — $env: prefix
$env:PATH
$env:HOME
$env:USERPROFILE

# Automatic variables
$_                        # Current pipeline object
$?                        # Success status of last command
$LASTEXITCODE             # Exit code of last external program
$args                     # Script arguments
$PSVersionTable           # PowerShell version info
```

## Command Equivalents

| Task                   | Bash                   | PowerShell                                              |
| ---------------------- | ---------------------- | ------------------------------------------------------- |
| List files             | `ls -la`               | `Get-ChildItem` or `ls` (alias)                         |
| Find files recursively | `find . -name '*.rs'`  | `Get-ChildItem -Recurse -Filter "*.rs"` or `ls -r *.rs` |
| Current directory      | `pwd`                  | `Get-Location` or `pwd` (alias)                         |
| Change directory       | `cd /path`             | `Set-Location /path` or `cd /path` (alias)              |
| Read file              | `cat file.txt`         | `Get-Content file.txt` or `cat file.txt`                |
| Write file             | `echo "text" > f.txt`  | `"text" \| Out-File f.txt` or `"text" > f.txt`          |
| Append to file         | `echo "text" >> f.txt` | `"text" \| Out-File -Append f.txt` or `"text" >> f.txt` |
| Create directory       | `mkdir -p path`        | `New-Item -ItemType Directory path` or `mkdir path`     |
| Create file            | `touch file.txt`       | `New-Item -ItemType File file.txt`                      |
| Copy                   | `cp src dst`           | `Copy-Item src dst` or `cp src dst`                     |
| Move                   | `mv src dst`           | `Move-Item src dst` or `mv src dst`                     |
| Remove                 | `rm file`              | `Remove-Item file` or `rm file`                         |
| Recursive remove       | `rm -rf dir`           | `Remove-Item -Recurse -Force dir` or `rm -r -fo dir`    |
| Filter text            | `grep pattern`         | `Select-String -Pattern "pattern"` or `sls "pattern"`   |
| Replace text           | `sed 's/a/b/g'`        | `-replace 'a', 'b'` operator                            |
| Count lines            | `wc -l`                | `Measure-Object -Line`                                  |
| Sort                   | `sort`                 | `Sort-Object` or `sort`                                 |
| Head                   | `head -5`              | `Select-Object -First 5`                                |
| Tail                   | `tail -5`              | `Select-Object -Last 5`                                 |
| Tail follow            | `tail -f log`          | `Get-Content -Tail 10 -Wait log`                        |
| Process list           | `ps aux`               | `Get-Process` or `ps`                                   |
| Kill process           | `kill PID`             | `Stop-Process -Id PID` or `kill -Id PID`                |
| Get help               | `man cmd`              | `Get-Help cmd -Full` or `help cmd`                      |
| Find command           | `man -k keyword`       | `Get-Command *keyword*`                                 |
| Date                   | `date`                 | `Get-Date` or `date`                                    |
| Sleep                  | `sleep 1`              | `Start-Sleep -Seconds 1` or `sleep 1`                   |
| Download file          | `wget url`             | `Invoke-WebRequest url -OutFile file`                   |
| Environment vars       | `env`                  | `Get-ChildItem env:` or `ls env:`                       |
| Which/type             | `which cmd`            | `Get-Command cmd` or `gcm cmd`                          |
| Exit code              | `$?`                   | `$LASTEXITCODE` (external) or `$?` (cmdlet)             |
| Source file            | `. file.sh`            | `. .\file.ps1`                                          |
| Background job         | `cmd &`                | `Start-Job { cmd }` or `cmd &`                          |

## Pipelines

```powershell
# Pipe OBJECTS, not text
Get-ChildItem | Where-Object { $_.Length -gt 1MB } | Sort-Object Length -Descending

# $_ is the current pipeline object
Get-Process | Where-Object { $_.WorkingSet -gt 100MB } | Select-Object Name, Id, WorkingSet

# Simplified Where-Object syntax (PS 3.0+)
Get-Process | Where-Object WorkingSet -gt 100MB

# ForEach-Object for iteration
1..10 | ForEach-Object { $_ * 2 }
ls *.txt | ForEach-Object { "Processing $_" }

# Multi-line pipelines use backtick ` (not recommended) or pipe at line end
Get-ChildItem |
    Where-Object Length -gt 1MB |
    Sort-Object Name
```

## Filtering and Selecting

```powershell
# Where-Object — filter objects
Get-Process | Where-Object { $_.CPU -gt 10 }
Get-ChildItem | Where-Object Name -like "*.txt"

# Select-Object — pick properties or limit rows
Get-Process | Select-Object Name, Id, CPU
Get-Process | Select-Object -First 5
Get-Process | Select-Object -Last 10
Get-Process | Select-Object -Skip 5 -First 5

# Select-String — grep equivalent for text
Select-String -Path "*.log" -Pattern "ERROR"
Get-Content file.txt | Select-String "pattern"
```

## Common Patterns

```powershell
# Find files modified in last 7 days
Get-ChildItem -Recurse | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-7) }

# Count lines of all .rs files
Get-ChildItem -Recurse -Filter *.rs | Get-Content | Measure-Object -Line

# Find large files
Get-ChildItem -Recurse | Where-Object Length -gt 10MB | Sort-Object Length -Descending

# Delete all .tmp files recursively
Get-ChildItem -Recurse -Filter *.tmp | Remove-Item

# Monitor a log file (like tail -f)
Get-Content -Path "app.log" -Tail 20 -Wait

# Check if command succeeded
if ($?) { "Success" } else { "Failed (exit code: $LASTEXITCODE)" }

# Loop with index
$items = @("a", "b", "c")
for ($i = 0; $i -lt $items.Count; $i++) {
    "$($i): $($items[$i])"
}

# Create multiple files
1..5 | ForEach-Object { New-Item -ItemType File -Name "file$_.txt" }

# Parse JSON
$data = Get-Content data.json | ConvertFrom-Json
$data.items[0].name

# Parse CSV
$rows = Import-Csv data.csv
$rows | Where-Object { $_.Status -eq "Active" }

# Export to JSON/CSV
Get-Process | Select-Object Name, Id | ConvertTo-Json | Out-File procs.json
Get-Process | Select-Object Name, Id | Export-Csv procs.csv
```

## Scripting

```powershell
# Parameters
param(
    [string]$Name,
    [int]$Count = 1,
    [switch]$Force
)

# Functions
function Get-Greeting {
    param([string]$Name = "World")
    "Hello, $Name!"
}

# If/else
if ($value -gt 10) {
    "Large"
} elseif ($value -gt 5) {
    "Medium"
} else {
    "Small"
}

# Switch
switch ($color) {
    "red"   { "Stop" }
    "green" { "Go" }
    default { "Unknown" }
}

# ForEach
foreach ($item in $collection) {
    "Item: $item"
}

# While
while ($count -gt 0) {
    $count--
}

# Try/catch
try {
    $result = 10 / 0
} catch {
    "Error: $_"
} finally {
    "Done"
}
```

## Comparison Operators

```powershell
-eq         # Equal
-ne         # Not equal
-gt         # Greater than
-lt         # Less than
-ge         # Greater or equal
-le         # Less or equal
-like       # Wildcard match (*, ?)
-notlike    # Wildcard non-match
-match      # Regex match
-notmatch   # Regex non-match
-contains   # Collection contains value
-in         # Value is in collection
```

## Key Gotchas

1. **No `&&` or `||`** — use `;` or `if ($?) { ... }`
2. **No `grep`/`sed`/`awk`** — use `Select-String`, `-replace`, `Where-Object`
3. **`$_` is current pipeline object**, not `$it` or `$in`
4. **Environment variables need `$env:` prefix** — `$env:PATH`, not `$PATH`
5. **Comparison uses `-eq`, not `=` or `==`** — `if ($a -eq 5)`
6. **Strings in double quotes** expand variables (`"Hello $name"`); single quotes don't
7. **Case-insensitive by default** — `"HELLO" -eq "hello"` is `$true`
8. **Backtick `` ` `` is escape/continuation**, not backslash
9. **No `#!/bin/pwsh` shebang needed** for .ps1 files
10. **`$LASTEXITCODE` for external programs**, `$?` for cmdlets
11. **`Measure-Object` replaces `wc`** — use `-Line`, `-Word`, `-Character` parameters
12. **No heredocs** — use here-strings: `@" ... "@` or `@' ... '@`
