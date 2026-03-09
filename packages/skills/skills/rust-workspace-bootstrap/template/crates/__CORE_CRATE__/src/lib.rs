use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreError {
	#[error("name cannot be empty")]
	EmptyName,
}

pub fn greet(name: &str) -> Result<String, CoreError> {
	if name.trim().is_empty() {
		return Err(CoreError::EmptyName);
	}

	Ok(format!("Hello, {name}!"))
}

#[cfg(test)]
mod tests {
	use super::greet;

	#[test]
	fn greets_with_name() {
		let result = greet("world");
		assert_eq!(result.as_deref(), Ok("Hello, world!"));
	}

	#[test]
	fn rejects_empty_name() {
		let result = greet("   ");
		assert!(result.is_err());
	}
}
