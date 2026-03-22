export interface SourceMetadata {
	componentName: string;
	filePath: string;
	line: number;
	column: number;
	elementTag: string;
	testId: string | null;
	ariaLabel: string | null;
	role: string | null;
	eventHandlers: string[];
	className: string | null;
}
