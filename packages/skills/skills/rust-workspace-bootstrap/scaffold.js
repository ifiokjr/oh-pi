#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function printUsage() {
	console.log(`
Rust Workspace Bootstrap

Usage:
  scaffold.js --name <project-name> [options]

Options:
  --name <kebab-case>       Required project name.
  --dir <path>              Target directory (default: ./<name>).
  --owner <github-owner>    GitHub org/user (default: your-github-org).
  --repo <github-repo>      GitHub repo name (default: <name>).
  --description <text>      Workspace description.
  --force                   Allow writing into a non-empty target directory.
  --help                    Show this help.
`);
}

function parseArgs(argv) {
	const options = {
		description: "",
		dir: "",
		force: false,
		help: false,
		name: "",
		owner: "your-github-org",
		repo: "",
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--help" || arg === "-h") {
			options.help = true;
			continue;
		}
		if (arg === "--force") {
			options.force = true;
			continue;
		}

		if (arg.startsWith("--")) {
			const key = arg.slice(2);
			const value = argv[index + 1];
			if (!value || value.startsWith("--")) {
				throw new Error(`Missing value for option: ${arg}`);
			}
			index += 1;

			switch (key) {
				case "name": {
					options.name = value;
					break;
				}
				case "dir": {
					options.dir = value;
					break;
				}
				case "owner": {
					options.owner = value;
					break;
				}
				case "repo": {
					options.repo = value;
					break;
				}
				case "description": {
					options.description = value;
					break;
				}
				default: {
					throw new Error(`Unknown option: ${arg}`);
				}
			}
			continue;
		}

		if (!options.name) {
			options.name = arg;
		}
	}

	return options;
}

function toTitleCase(value) {
	return value
		.split("-")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function collectFiles(rootDir, currentDir = rootDir) {
	const entries = fs.readdirSync(currentDir, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const absolutePath = path.join(currentDir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectFiles(rootDir, absolutePath));
			continue;
		}
		if (entry.isFile()) {
			files.push(path.relative(rootDir, absolutePath));
		}
	}

	return files;
}

function applyTokens(input, tokens) {
	let output = input;
	for (const [token, value] of Object.entries(tokens)) {
		output = output.split(token).join(value);
	}
	return output;
}

function ensureTargetDirectory(targetDir, force) {
	if (!fs.existsSync(targetDir)) {
		fs.mkdirSync(targetDir, { recursive: true });
		return;
	}

	const currentFiles = fs.readdirSync(targetDir);
	if (currentFiles.length > 0 && !force) {
		throw new Error(
			`Target directory is not empty: ${targetDir}\nUse --force if you want to scaffold into an existing directory.`,
		);
	}
}

function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		printUsage();
		return;
	}

	if (!options.name) {
		printUsage();
		throw new Error("Project name is required. Pass --name <project-name>.");
	}

	if (!/^[a-z][a-z0-9-]*$/.test(options.name)) {
		throw new Error("Project name must be kebab-case (letters, numbers, dashes). Example: acme-tool");
	}

	const projectName = options.name;
	const projectTitle = toTitleCase(projectName);
	const cratePrefix = projectName.replaceAll(/-/g, "_");
	const coreCrate = `${cratePrefix}_core`;
	const cliCrate = `${cratePrefix}_cli`;
	const targetDir = path.resolve(options.dir || projectName);
	const { owner } = options;
	const repo = options.repo || projectName;
	const description = options.description || `${projectTitle} Rust workspace`;

	const tokens = {
		__CLI_CRATE__: cliCrate,
		__CORE_CRATE__: coreCrate,
		__DESCRIPTION__: description,
		__GITHUB_OWNER__: owner,
		__GITHUB_REPO__: repo,
		__PROJECT_NAME__: projectName,
		__PROJECT_TITLE__: projectTitle,
	};

	const currentFile = import.meta.filename;
	const baseDir = import.meta.dirname;
	const templateDir = path.join(baseDir, "template");

	if (!fs.existsSync(templateDir)) {
		throw new Error(`Template directory not found: ${templateDir}`);
	}

	ensureTargetDirectory(targetDir, options.force);

	const templateFiles = collectFiles(templateDir);
	const writtenFiles = [];

	for (const relativeTemplatePath of templateFiles) {
		const sourcePath = path.join(templateDir, relativeTemplatePath);
		const targetRelativePath = applyTokens(relativeTemplatePath, tokens);
		const destinationPath = path.join(targetDir, targetRelativePath);
		const sourceContent = fs.readFileSync(sourcePath, "utf8");
		const destinationContent = applyTokens(sourceContent, tokens);

		fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
		fs.writeFileSync(destinationPath, destinationContent, "utf8");

		if (destinationPath.endsWith(".sh")) {
			fs.chmodSync(destinationPath, 0o755);
		}

		writtenFiles.push(targetRelativePath);
	}

	writtenFiles.sort();

	console.log(`\n✅ Scaffolding complete: ${targetDir}`);
	console.log(`   Project:      ${projectName}`);
	console.log(`   Core crate:   ${coreCrate}`);
	console.log(`   CLI crate:    ${cliCrate}`);
	console.log(`   GitHub repo:  ${owner}/${repo}`);
	console.log(`   Files:        ${writtenFiles.length}`);
	console.log("\nNext steps:");
	console.log(`  cd ${targetDir}`);
	console.log("  direnv allow  # or: devenv shell");
	console.log("  install:cargo:bin");
	console.log("  lint:all && test:all && build:all");
	console.log("  knope document-change");
	console.log("  knope release --dry-run\n");
}

try {
	main();
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`\n❌ ${message}\n`);
	process.exit(1);
}
