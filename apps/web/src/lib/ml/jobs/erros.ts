/** Erro que não adianta tentar de novo (dado inválido, configuração faltando). */
export class ErroPermanente extends Error {
  constructor(mensagem: string, public detalhe?: Record<string, unknown>) {
    super(mensagem);
    this.name = "ErroPermanente";
  }
}

/** Não é falha: o job deve voltar à fila mais tarde SEM gastar tentativa (ex.: trava ocupada). */
export class ErroAguardar extends Error {
  constructor(mensagem: string, public emMs: number) {
    super(mensagem);
    this.name = "ErroAguardar";
  }
}

/** Execução interrompida porque pediram cancelamento (política "cancelar anterior"). */
export class ErroCancelado extends Error {
  constructor() {
    super("Cancelado a pedido.");
    this.name = "ErroCancelado";
  }
}
