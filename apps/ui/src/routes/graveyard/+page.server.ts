import { arena, ArenaUnavailable } from '$lib/server/arena';

export async function load() {
  try {
    return {entries:await arena.graveyard(),error:null};
  } catch (err) {
    return {entries:[],error:err instanceof ArenaUnavailable ? err.message : String(err)};
  }
}
