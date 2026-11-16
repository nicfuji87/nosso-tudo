package app.nossotudo.saude.wear

import com.samsung.android.service.health.tracking.data.DataPoint
import com.samsung.android.service.health.tracking.data.ValueKey
import java.io.BufferedWriter
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.atomic.AtomicLong

/** Pasta de uma sessão de coleta: files/sessoes/AAAAMMDD-HHMMSS/ */
object Pastas {
    private val fmt = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US)
    fun novaSessao(raiz: File): File = File(raiz, "sessoes/${fmt.format(Date())}").apply { mkdirs() }
    fun novoEcg(raiz: File): File = File(raiz, "ecg").apply { mkdirs() }.let { File(it, "ecg-${fmt.format(Date())}.csv") }
}

/** Grava os DataPoints de um rastreador em CSV; o cabeçalho sai do primeiro lote recebido. */
class GravadorCsv(private val arquivo: File?, val tipo: String) {
    private var writer: BufferedWriter? = null
    private var chaves: List<Pair<String, ValueKey<*>>> = emptyList()
    val amostras = AtomicLong(0)
    @Volatile var ultimaAmostraMs: Long = 0
    private var ultimoFlushMs: Long = 0

    @Synchronized
    fun gravar(lote: List<DataPoint>) {
        if (lote.isEmpty()) return
        val destino = arquivo ?: run { // modo segundo plano: só conta, não grava CSV
            amostras.addAndGet(lote.size.toLong()); ultimaAmostraMs = System.currentTimeMillis(); return
        }
        val w = writer ?: run {
            chaves = Sensores.chavesPara(tipo, lote.first())
            destino.bufferedWriter().also {
                it.write("ts_ms,recebido_ms," + chaves.joinToString(",") { c -> c.first })
                it.newLine()
                writer = it
            }
        }
        val agora = System.currentTimeMillis()
        for (dp in lote) {
            w.write("${dp.timestamp},$agora")
            for ((_, chave) in chaves) {
                w.write(",")
                w.write(Sensores.valorCsv(dp, chave))
            }
            w.newLine()
        }
        amostras.addAndGet(lote.size.toLong())
        ultimaAmostraMs = agora
        // Grava no disco a cada 15 s: sensores lentos (HR a 1 Hz) não ficam presos no buffer
        if (agora - ultimoFlushMs >= 15_000) {
            w.flush()
            ultimoFlushMs = agora
        }
    }

    @Synchronized
    fun fechar() {
        runCatching { writer?.flush(); writer?.close() }
        writer = null
    }
}

/** Log de texto simples: eventos, erros, bateria. */
class LogCsv(arquivo: File, cabecalho: String) {
    private val w = arquivo.bufferedWriter().apply { write(cabecalho); newLine(); flush() }

    @Synchronized
    fun linha(vararg campos: Any?) {
        w.write(campos.joinToString(",") { (it?.toString() ?: "").replace(',', ';').replace('\n', ' ') })
        w.newLine()
        w.flush()
    }

    @Synchronized
    fun fechar() = runCatching { w.close() }
}
