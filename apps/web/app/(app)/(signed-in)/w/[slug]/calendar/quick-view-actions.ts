import { type AssignKind, assignKind } from '../sessions/trainer-dialog-model';
import type { CalendarAccess, CalendarItem } from './quick-view';

/** What the quick view offers for one block (WC-05, F014 AC6 and AC12). */
export interface QuickViewActions {
  /** *Openen*: always, the page itself decides what the person sees there. */
  open: true;
  /** *Verplaatsen*: a private session that is not cancelled, for its trainer or an Owner. */
  move: boolean;
  /** *Wijzigen*: a class date that is not cancelled, for a person who manages classes. */
  change: boolean;
  /** *Klantprofiel*: the client of the viewer's own session, or of any session for an Owner. */
  clientProfile: boolean;
  /** The Owner's *Trainer toewijzen* / *Trainer vervangen* (a class date) or *Trainer wijzigen* (a private session), F023. */
  assign: AssignKind | null;
}

/**
 * The actions that exist for a block. A Trainer has `clients.view`, yet on a colleague's session
 * the quick view stays *Openen* only (AC12): the client profile and the move follow whose
 * session it is, not what the role may see elsewhere.
 */
export function quickViewActions(
  item: Pick<CalendarItem, 'type' | 'status' | 'trainer' | 'clients' | 'series'>,
  access: CalendarAccess,
): QuickViewActions {
  const isPrivate = item.type === 'private';
  const cancelled = item.status === 'cancelled';
  const own = item.trainer?.id === access.teamMemberId;
  return {
    open: true,
    move: isPrivate && !cancelled && (access.canMoveAny || (access.canMoveOwn && own)),
    change: !isPrivate && !cancelled && access.canChangeClasses,
    clientProfile:
      isPrivate &&
      (item.clients?.length ?? 0) > 0 &&
      access.canSeeClients &&
      (own || access.canMoveAny),
    assign: access.canAssign ? assignKind(item) : null,
  };
}
