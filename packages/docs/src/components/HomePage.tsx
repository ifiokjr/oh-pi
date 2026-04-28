import { BookOpen, Puzzle, Terminal, Zap } from "lucide-react";
import { Link } from "react-router";

interface FeatureCardProps {
	icon: React.ReactNode;
	title: string;
	description: string;
	to: string;
}

function FeatureCard({ icon, title, description, to }: FeatureCardProps) {
	return (
		<Link
			to={to}
			className="group rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 hover:border-pi-emerald/40 hover:bg-zinc-800/50 transition-all"
		>
			<div className="mb-3 text-pi-emerald group-hover:text-pi-emerald-glow transition-colors">{icon}</div>
			<h3 className="text-lg font-semibold text-zinc-100 mb-2">{title}</h3>
			<p className="text-sm text-zinc-400 leading-relaxed">{description}</p>
		</Link>
	);
}

export function HomePage() {
	return (
		<div className="space-y-12">
			{/* Hero */}
			<div className="text-center space-y-4 pt-8">
				<div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-pi-emerald/10 border border-pi-emerald/20 mb-4">
					<Terminal className="h-8 w-8 text-pi-emerald" />
				</div>
				<h1 className="text-4xl font-bold text-zinc-50">oh-pi</h1>
				<p className="text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
					Extensions, themes, prompts, skills, and tools for the{" "}
					<a
						href="https://github.com/badlogic/pi-mono"
						className="text-pi-emerald hover:text-pi-emerald-glow underline underline-offset-4"
					>
						Pi Coding Agent
					</a>
					. A lockstep-versioned pnpm monorepo that adapts to your workflow, not the other way around.
				</p>
			</div>

			{/* Feature cards */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<FeatureCard
					icon={<Puzzle className="h-6 w-6" />}
					title="Extensions"
					description="Customize Pi with background tasks, git guard, session naming, auto-updates, and more. The extension system is the heart of Pi's flexibility."
					to="/04-extensions"
				/>
				<FeatureCard
					icon={<Zap className="h-6 w-6" />}
					title="Skills & Prompts"
					description="Skill packs and prompt templates let you teach Pi new capabilities without forking. Install community packs or create your own."
					to="/05-skills-prompts-themes-packages"
				/>
				<FeatureCard
					icon={<Terminal className="h-6 w-6" />}
					title="CLI & Sessions"
					description="Master Pi's interactive mode, session management, context compaction, and branching for powerful coding workflows."
					to="/02-interactive-mode"
				/>
				<FeatureCard
					icon={<BookOpen className="h-6 w-6" />}
					title="SDK & TUI"
					description="Build your own extensions with the Pi SDK, RPC protocol, and TUI component system. Full API reference included."
					to="/06-settings-sdk-rpc-tui"
				/>
			</div>

			{/* Quick install */}
			<div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
				<h2 className="text-lg font-semibold text-zinc-100">Quick Start</h2>
				<div className="space-y-3">
					<div>
						<p className="text-sm text-zinc-400 mb-1.5">Install the full oh-pi extension suite:</p>
						<code className="block bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm font-mono text-pi-emerald-glow">
							npx @ifi/oh-pi
						</code>
					</div>
					<div>
						<p className="text-sm text-zinc-400 mb-1.5">Or install individual packages:</p>
						<code className="block bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm font-mono text-pi-emerald-glow">
							pi install npm:@ifi/oh-pi-extensions
						</code>
					</div>
				</div>
			</div>

			{/* Links */}
			<div className="flex flex-wrap gap-4 justify-center text-sm">
				<a href="https://github.com/ifiokjr/oh-pi" className="text-zinc-400 hover:text-pi-emerald transition-colors">
					GitHub →
				</a>
				<Link to="/01-overview" className="text-zinc-400 hover:text-pi-emerald transition-colors">
					Full overview →
				</Link>
				<Link to="/07-cli-reference" className="text-zinc-400 hover:text-pi-emerald transition-colors">
					CLI reference →
				</Link>
			</div>
		</div>
	);
}
