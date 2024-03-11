<script lang="ts">
	import CanvasOverlay from '../canvas/CanvasOverlay.svelte';
	import {landmenu} from '$lib/ui/landmenu/landmenu';
	import ImgBlockie from '$utils/ethereum/ImgBlockie.svelte';
	import {getFactionIcon} from '$lib/actions/utils/faction-icons';
	import {getCurrentColor} from '$lib/actions/utils/current-color';
	import {account, accountData} from '$lib/blockchain/connection';
	import {epochState} from '$lib/state/Epoch';
	import {CircleOff, Trash2} from 'lucide-svelte';
	import {Color, EVIL_OWNER_ADDRESS} from 'stratagems-common';
	import {info} from '../information/info';
	import {playerView} from '../missiv/playerView';

	$: offchainState = accountData.offchainState;
	$: player = $account.address;
	$: currentColor = getCurrentColor($offchainState, player);
	$: icon = getFactionIcon(currentColor);
	$: isPlayerLand = player?.toLowerCase() == $landmenu?.owner.toLowerCase();

	function addMove() {
		if (!player) {
			throw new Error(`no player account`);
		}
		if (!$landmenu) {
			throw new Error('No menu');
		}
		if ($landmenu.cell.next.life !== 0) {
			throw new Error(`cell already occupied`);
		} else {
			if (!$epochState.isActionPhase) {
				info.setRevealPhase();
				return;
			}
			accountData.addMove({x: $landmenu.x, y: $landmenu.y, color: currentColor, player}, $epochState.epoch);
		}

		landmenu.set(undefined);
	}

	function withdrawLand() {
		if (!player) {
			throw new Error(`no player account`);
		}
		if (!$landmenu) {
			throw new Error('No menu');
		}
		accountData.addMove({x: $landmenu.x, y: $landmenu.y, color: Color.None, player}, $epochState.epoch);
		landmenu.set(undefined);
	}

	function switchColor() {
		if (!player) {
			throw new Error(`no player account`);
		}
		if (!$landmenu) {
			throw new Error('No menu');
		}
		accountData.addMove({x: $landmenu.x, y: $landmenu.y, color: currentColor, player}, $epochState.epoch);
		landmenu.set(undefined);
	}

	function message() {
		if (!$landmenu) {
			throw new Error(`no menu`);
		}
		playerView.set({
			player: $landmenu.owner,
		});
		landmenu.set(undefined);
	}
</script>

{#if $landmenu}
	<CanvasOverlay x={$landmenu.x} y={$landmenu.y}
		><div class="menu">
			<div class="third-circle"></div>

			<div class="action">
				{#if isPlayerLand && currentColor !== $landmenu.cell.next.color}
					<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<img class="clickable" alt="current faction icon" src={icon} on:click={() => switchColor()} />
				{:else if $landmenu.cell.next.life !== 0}
					<CircleOff style="width: 2em; height: 2em;color: gray;" />
				{:else}
					<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<img class="clickable" alt="current faction icon" src={icon} on:click={() => addMove()} />
				{/if}
			</div>
			<div class="action">
				{#if isPlayerLand}
					<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<!-- svelte-ignore a11y-no-static-element-interactions -->
					<span on:click={() => withdrawLand()}><Trash2 style="width: 2em; height: 2em;color: red;" /></span>
				{:else if $landmenu.owner == EVIL_OWNER_ADDRESS}
					<CircleOff style="width: 2em; height: 2em;color: gray;" />
				{:else}
					<ImgBlockie
						style="object-fit: cover;height: 100%;width: 100%;cursor: pointer;"
						address={$landmenu.owner}
						on:click={() => message()}
					/>
				{/if}
			</div>
		</div></CanvasOverlay
	>
{/if}

<style>
	.menu {
		position: relative;
		pointer-events: none;
		width: 170px;
		height: 64px;
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		transform: translate(0, -30%);
	}

	.third-circle {
		pointer-events: none;
		position: absolute;
		top: 20px;
		left: 30px;
		border-radius: 999999px;
		background-color: rgba(1, 1, 1, 0.2);
		width: 110px;
		height: 64px;
	}

	.action {
		position: relative;
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 1em;
		pointer-events: initial;
		border-radius: 999999px;
		overflow: hidden;
		background-color: #222;
		width: 64px;
		height: 64px;
	}

	.clickable {
		cursor: pointer;
	}
</style>
