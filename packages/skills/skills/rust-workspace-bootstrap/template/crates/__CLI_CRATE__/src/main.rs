use clap::Parser;

#[derive(Debug, Parser)]
#[command(name = "__PROJECT_NAME__")]
#[command(about = "__DESCRIPTION__")]
struct Args {
	/// Optional name to greet.
	#[arg(short, long, default_value = "world")]
	name: String,
}

fn main() {
	let args = Args::parse();
	match __CORE_CRATE__::greet(&args.name) {
		Ok(message) => println!("{message}"),
		Err(error) => {
			eprintln!("error: {error}");
			std::process::exit(1);
		}
	}
}
