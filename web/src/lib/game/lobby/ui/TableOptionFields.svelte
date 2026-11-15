<!--
	THE GAME'S OWN OPTIONS AT A TABLE (`$lib/game/lobby/table`'s
	`TableOptions`), asked one field at a time: a select for a field with
	choices, a number otherwise. One component for both lobbies that create a
	table, the online one (`routes/lobby`) and the offline world's
	(`routes/offline`), so a field is asked the same way in both.

	Renders and reports, and decides nothing: a value is clamped to its field
	when the table is created (`encodeTableOptions`), not while it is typed.
-->
<script lang="ts">
	import type {TableOptionField} from '$lib/game/lobby/table';

	interface Props {
		fields: readonly TableOptionField[];
		values: Readonly<Record<string, number | string>>;
		onchange: (id: string, value: number | string) => void;
	}

	let {fields, values, onchange}: Props = $props();
</script>

{#each fields as field (field.id)}
	{#if field.choices}
		<label
			class="mt-4 block text-sm font-medium"
			for={`table-option-${field.id}`}>{field.label}</label
		>
		<select
			id={`table-option-${field.id}`}
			class="mt-2 rounded-md border bg-background px-2 py-1 text-sm"
			data-testid={`table-option-${field.id}`}
			value={values[field.id]}
			onchange={(event) => onchange(field.id, event.currentTarget.value)}
		>
			{#each field.choices as choice (choice.value)}
				<option value={choice.value}>{choice.label}</option>
			{/each}
		</select>
	{:else}
		<label
			class="mt-4 block text-sm font-medium"
			for={`table-option-${field.id}`}
			>{field.label}
			<span class="font-normal text-muted-foreground"
				>({field.min} to {field.max}{field.unit ? ` ${field.unit}` : ''})</span
			></label
		>
		<input
			id={`table-option-${field.id}`}
			class="mt-2 w-24 rounded-md border bg-background px-2 py-1 text-sm"
			type="number"
			min={field.min}
			max={field.max}
			data-testid={`table-option-${field.id}`}
			value={values[field.id]}
			oninput={(event) => onchange(field.id, event.currentTarget.valueAsNumber)}
		/>
	{/if}
{/each}
