import { describe, expect, it, vi } from "vitest";
import { transformJSX } from "../../../src/plugins/babel-transform";

const FILE = "src/components/App.tsx";

describe("transformJSX", () => {
	it("injects data-kovar-file/line/col on basic JSX elements", () => {
		const code = `const App = () => <div>Hello</div>;`;
		const result = transformJSX(code, FILE);

		expect(result).not.toBeNull();
		expect(result!.code).toContain(`data-kovar-file="${FILE}"`);
		expect(result!.code).toContain("data-kovar-line=");
		expect(result!.code).toContain("data-kovar-col=");
	});

	it("skips React fragments (<>...</>)", () => {
		const code = `const App = () => <>Hello</>;`;
		const result = transformJSX(code, FILE);

		expect(result).toBeNull();
	});

	it("skips React.Fragment", () => {
		const code = `const App = () => <React.Fragment>Hello</React.Fragment>;`;
		const result = transformJSX(code, FILE);

		expect(result).toBeNull();
	});

	it("skips elements already having data-kovar-* attributes (idempotent)", () => {
		const code = `const App = () => <div data-kovar-file="x" data-kovar-line="1" data-kovar-col="0">Hello</div>;`;
		const result = transformJSX(code, FILE);

		expect(result).toBeNull();
	});

	it("returns null for files with no JSX", () => {
		const code = `const x = 1 + 2;\nexport default x;`;
		const result = transformJSX(code, FILE);

		expect(result).toBeNull();
	});

	it("handles TypeScript generics in TSX", () => {
		const code = `const App = <T extends string>(props: { value: T }) => <span>{props.value}</span>;`;
		const result = transformJSX(code, FILE);

		expect(result).not.toBeNull();
		expect(result!.code).toContain("data-kovar-file");
		expect(result!.code).toContain("data-kovar-line");
		expect(result!.code).toContain("data-kovar-col");
	});

	it("preserves existing attributes", () => {
		const code = `const App = () => <div className="test" id="main">Hello</div>;`;
		const result = transformJSX(code, FILE);

		expect(result).not.toBeNull();
		expect(result!.code).toContain('className="test"');
		expect(result!.code).toContain('id="main"');
		expect(result!.code).toContain("data-kovar-file");
	});

	it("handles multiple elements in one file", () => {
		const code = `const App = () => (
  <div>
    <span>One</span>
    <span>Two</span>
  </div>
);`;
		const result = transformJSX(code, FILE);

		expect(result).not.toBeNull();
		// div + 2 spans = 3 injections
		const matches = result!.code.match(/data-kovar-file/g);
		expect(matches).toHaveLength(3);
	});

	it("returns a source map", () => {
		const code = `const App = () => <div>Hello</div>;`;
		const result = transformJSX(code, FILE);

		expect(result).not.toBeNull();
		expect(result!.map).toBeDefined();
		expect(result!.map).toHaveProperty("mappings");
		expect(result!.map).toHaveProperty("sources");
	});
});
