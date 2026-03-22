import React from "react";

const api = { post: () => {} };

function LoginForm() {
	const handleLogin = () => {};
	const handleChange = () => {};
	const submit = () => {};

	return (
		<div className="form-container" role="form">
			<input
				aria-label="Email address"
				placeholder="Enter email"
				data-testid="login-email"
				onChange={handleChange}
			/>
			<input type="password" name="password" />
			<button data-testid="login-submit" onClick={handleLogin} role="button" aria-label="Sign in">
				Sign In
			</button>
			<button data-testid="inline-arrow" onClick={() => submit()}>Quick Submit</button>
			<button data-testid="member-arrow" onClick={() => api.post()}>API Submit</button>
		</div>
	);
}

export default LoginForm;
