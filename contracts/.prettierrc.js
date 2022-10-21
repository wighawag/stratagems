module.exports = {
	useTabs: true,
	singleQuote: true,
	printWidth: 120,
	bracketSpacing: false,
	overrides: [
		{
			files: '*.sol',
			options: {
				singleQuote: false,
				explicitTypes: 'always',
			},
		},
	],
	plugins: [require.resolve('prettier-plugin-solidity')],
};
