---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Stratagems"
  text: "The Infinite Board Game"
  tagline: Stratagems is a persistent and permission-less game where players use a specific set of colors to compete for the control of the board. Alliances and betrayal are part of the arsenal as colors mix and shift on the board.
  image:
    src: /five-gems.svg
    alt: Stratagems Logo
  actions:
    - theme: brand
      text: Guide
      link: /guide/getting-started
    - theme: alt
      text: Contracts
      link: /contracts/Gems

features:
  - title: Permission-less
    details: Any player can join at any time.
  - title: Persistent
    details: The game never ends
  - title: Interoperable
    details: The whole game is a smart contract
---


<script setup>
import { ref } from 'vue'

const obj = ref({
  type: 'Idle',
  // working: false, TODO
  message: ""
})

function acknowledge() {
  obj.value.type = 'Idle';
}
async function subscribe(e) {
  e.preventDefault();
  console.log("subscribing...");
  const form = document.getElementById('subscribeForm');;
  const formData = new FormData(form);
  const data = new URLSearchParams([...formData]);
  console.log({ data: data.toString() });
  try {
      const result = await fetch(form.action, {
          method: form.method,
          body: data,
      });
      const json = await result.json();
      console.log(json);
      if (json.error) {
          throw new Error(json.error);
      }
      obj.value = {type: 'Success', message : 'Subscribed'};
      setTimeout(() => acknowledge(), 3000);
  } catch (e) {
    obj.value = { type: 'Error', message: e.message || '' + e };
  }
}

</script>


<div class="custom-layout">
  <form
					class="mt-1 max-w-sm"
					action="https://tinyletter.com/stratagems"
					method="post"
					target="popupwindow"
					onsubmit="window.open('https://tinyletter.com/stratagems', 'popupwindow', 'scrollbars=yes,width=800,height=600');return true"
				>
					<p id="call-to-action">
						Subscribe for updates on Stratagems!
					</p>
					<div class="flex gap-x-4">
						<!-- <label for="email-address" class="sr-only">Email address</label> -->
						<input
							id="email-address"
							name="email"
							type="email"
							autocomplete="email"
							required
							placeholder="Enter your email"
						/>
						<button
              class="btn"
              id="submit"
							type="submit"
							>Subscribe</button
						>
					</div>
				</form>
</div>
