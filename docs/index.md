---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  # name: "Stratagems"
  text: "The Genesis of a New World"
  tagline: "Stratagems is an independent universe forever running where players, like actual gods create islands on an endless sea using ETH with the hope to collect more of it from the other players. Alliances and betrayal are part of the arsenal as factions battle for the control of the world."
  image:
    src: /logo.png
    width: 512
    height: 512
    alt: Stratagems Logo
  actions:
    - theme: brand
      text: Guide
      link: /guide/getting-started/
    - theme: alt
      text: Contracts
      link: /contracts/Stratagems/
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

<p class="topbar" v-if="obj.type=='Error'" style="color:rgb(197,48,48);background-color:rgb(255, 245, 245);border-color:rgb(252, 129, 129);">{{obj.message}}</p>
<p  class="topbar" v-if="obj.type=='Success'" style="color:rgb(35,78,82);background-color:rgb(230, 255, 250);border-color:rgb(56, 178, 172);">{{obj.message}}</p>

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
