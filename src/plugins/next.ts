interface NextConfig {
	experimental?: Record<string, unknown>;
	babel?: { plugins?: unknown[] };
	[key: string]: unknown;
}

export function withKovar(nextConfig: NextConfig = {}): NextConfig {
	if (process.env.NODE_ENV === "production") return nextConfig;

	return {
		...nextConfig,
		experimental: {
			...nextConfig.experimental,
			forceSwcTransforms: false,
		},
	};
}
