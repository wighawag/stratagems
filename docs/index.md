---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Stratagems"
  text: "The Genesis of a New World"
  tagline: "Stratagems is an independent universe forever running where players strategicaly place colors on an infinite grid using ETH with the hope to collect more of it from the other players. Alliances and betrayal are part of the arsenal as the colors mix and shift."
  # text: "The Genesis Of A New World"
  # tagline: Stratagems is an independent universe forever running where players act as gods and compete by deploying new lands and units in the world's endless sea. Alliances and betrayal are part of the arsenal as the population under their control fight for domination.
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
    - theme: alt
      text: Play Test
      link: https://betallion.com/stratagems/join/tKbn9Mph

features:
  - title: Permission-less
    details: Any player can join at any time.
  - title: Persistent
    details: The game never ends
  - title: Composable
    details: New Games are being built on top.
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
      if (json.message) {
        obj.value = {type: 'Success', message : json.message};
      } else {
        obj.value = {type: 'Success', message : "Noted, You'll receive an email to confirm your subscription"};
      }
  } catch (e) {
    obj.value = { type: 'Error', message: e.message || '' + e };
  } finally {
    setTimeout(() => acknowledge(), 5000);
  }
}

</script>


<div class="custom-layout">

<section class="gui-toast-group">
  <output role="status" class="gui-toast" v-if="obj.type=='Error'" style="color: #dc2626;">{{obj.message}}</output>
  <output role="status" class="gui-toast" v-if="obj.type=='Success'" style="color: #16a34a;">{{obj.message}}</output>
</section>
  
  <form id="subscribeForm" action="https://etherplay-newsletter-subscription.rim.workers.dev" method="POST">
    <!-- TODO <label for="email" class="sr-only">Email address</label> -->
    <p id="call-to-action">
						Subscribe for updates on Stratagems and more from Etherplay!
					</p>
    <div class="flex gap-x-4">
    <input type="hidden" name="main_list" value="announcements@etherplay.io" />
    <input type="hidden" name="sub_list" value="stratagems-announcements@etherplay.io"/>
    <input
      id="email"
      name="email"
      type="email"
      placeholder="Enter your email"
						/>
    <button id="submit" class="btn" @click="subscribe">
    Subscribe
    </button>
    </div>
  </form>
</div>
