export const anonimo = "Anonimo";
export const isNotLogged = (myId: string) => !myId?.trim() || myId === anonimo;