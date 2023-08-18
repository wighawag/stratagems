<script lang="ts">
	import {epoch, epochInfo} from '$lib/blockchain/state/Epoch';
</script>

<label for="epoch">Epoch</label>
<p id="epoch">{$epoch}</p>

<label for="epochInfo">epochInfo</label>
<p id="epochInfo">{$epochInfo.timeLeftToCommit}</p>
