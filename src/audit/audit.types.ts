export type ActorType = 'USER' | 'SYSTEM';

export interface UserActor {
  type: 'USER';
  id: string;
  role: string;
}

export interface SystemActor {
  type: 'SYSTEM';
}

export type Actor = UserActor | SystemActor;

export interface ActorContext {
  actor: Actor;
  requestId?: string;
}
