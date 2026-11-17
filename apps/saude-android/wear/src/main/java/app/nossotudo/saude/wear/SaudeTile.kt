package app.nossotudo.saude.wear

import android.content.Context
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DeviceParametersBuilders.DeviceParameters
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.protolayout.material.ChipColors
import androidx.wear.protolayout.material.CompactChip
import androidx.wear.protolayout.material.Text
import androidx.wear.protolayout.material.Typography
import androidx.wear.protolayout.material.layouts.MultiButtonLayout
import androidx.wear.protolayout.material.layouts.PrimaryLayout
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * Atalho no mostrador (Tile): último batimento, bateria e estado do Radar de Saúde,
 * com 1 toque para registrar mal-estar ou fazer o teste em pé.
 */
class SaudeTile : TileService() {

    companion object {
        private const val VERSAO = "2"
        const val EXTRA_ROTA = "rota"

        /** Pede ao sistema para redesenhar o Tile (após cada envio ou mudança de estado). */
        fun atualizar(ctx: Context) {
            runCatching { getUpdater(ctx.applicationContext).requestUpdate(SaudeTile::class.java) }
        }
    }

    override fun onTileRequest(req: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        EstadoSaude.iniciar(this)
        val layout = layout(this, req.deviceConfiguration)
        return Futures.immediateFuture(
            TileBuilders.Tile.Builder()
                .setResourcesVersion(VERSAO)
                .setFreshnessIntervalMillis(15 * 60_000L)
                .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(layout))
                .build(),
        )
    }

    override fun onTileResourcesRequest(req: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        Futures.immediateFuture(
            ResourceBuilders.Resources.Builder().setVersion(VERSAO)
                .addIdToImageMapping(
                    "logo",
                    ResourceBuilders.ImageResource.Builder().setAndroidResourceByResId(
                        ResourceBuilders.AndroidImageResourceByResId.Builder().setResourceId(R.drawable.logo_nt_selo).build(),
                    ).build(),
                ).build(),
        )

    private fun abrir(ctx: Context, id: String, rota: String) = ModifiersBuilders.Clickable.Builder()
        .setId(id)
        .setOnClick(
            ActionBuilders.LaunchAction.Builder().setAndroidActivity(
                ActionBuilders.AndroidActivity.Builder()
                    .setPackageName(ctx.packageName)
                    .setClassName(MainActivity::class.java.name)
                    .addKeyToExtraMapping(EXTRA_ROTA, ActionBuilders.stringExtra(rota))
                    .build(),
            ).build(),
        ).build()

    private fun layout(ctx: Context, dp: DeviceParameters): LayoutElementBuilders.LayoutElement {
        val bpm = EstadoSaude.bpm.value
        val recente = System.currentTimeMillis() - EstadoSaude.bpmTs.value < 15 * 60_000L
        val bateria = Bateria.nivel(ctx)
        val p = ctx.getSharedPreferences("sync", Context.MODE_PRIVATE)
        val radar = when (p.getString("radar_nivel", null)) {
            "estresse" -> "Radar: corpo sob estresse"
            "observar" -> "Radar: observar"
            "normal" -> "Radar: dentro do normal"
            "calibrando" -> "Radar: calibrando"
            else -> "Radar: sem noite medida"
        }
        val corRadar = when (p.getString("radar_nivel", null)) {
            "estresse" -> 0xFFF2C14B.toInt(); "normal" -> 0xFF8FDE95.toInt(); else -> 0xFFB4B9B4.toInt()
        }

        val numero = Text.Builder(ctx, if (bpm != null && recente) "$bpm" else "—")
            .setTypography(Typography.TYPOGRAPHY_DISPLAY2)
            .setColor(argb(0xFFFF6B7D.toInt()))
            .build()
        val legenda = Text.Builder(ctx, "bpm" + (bateria?.let { " · bateria $it%" } ?: ""))
            .setTypography(Typography.TYPOGRAPHY_CAPTION1)
            .setColor(argb(0xFFB4B9B4.toInt()))
            .build()
        val dp24 = androidx.wear.protolayout.DimensionBuilders.dp(22f)
        val selo = LayoutElementBuilders.Image.Builder().setResourceId("logo").setWidth(dp24).setHeight(dp24).build()
        val conteudo = LayoutElementBuilders.Column.Builder()
            .addContent(selo)
            .addContent(numero)
            .addContent(legenda)
            .addContent(LayoutElementBuilders.Spacer.Builder().setHeight(androidx.wear.protolayout.DimensionBuilders.dp(4f)).build())
            .addContent(Text.Builder(ctx, radar).setTypography(Typography.TYPOGRAPHY_CAPTION2).setColor(argb(corRadar)).build())
            .build()

        val cores = ChipColors(argb(0xFF2A1215.toInt()), argb(0xFFFF8E9B.toInt()))
        val botoes = MultiButtonLayout.Builder()
            .addButtonContent(CompactChip.Builder(ctx, "Mal-estar", abrir(ctx, "malestar", "malestar"), dp).setChipColors(cores).build())
            .addButtonContent(
                CompactChip.Builder(ctx, "Em pé", abrir(ctx, "ortostatico", "ortostatico"), dp)
                    .setChipColors(ChipColors(argb(0xFF1C1F1E.toInt()), argb(0xFFF7F6F2.toInt()))).build(),
            )
            .build()

        return PrimaryLayout.Builder(dp)
            .setPrimaryLabelTextContent(
                Text.Builder(ctx, "Saúde NT").setTypography(Typography.TYPOGRAPHY_CAPTION1).setColor(argb(0xFF9EE8A6.toInt())).build(),
            )
            .setContent(
                LayoutElementBuilders.Column.Builder()
                    .addContent(conteudo)
                    .addContent(LayoutElementBuilders.Spacer.Builder().setHeight(androidx.wear.protolayout.DimensionBuilders.dp(6f)).build())
                    .addContent(botoes)
                    .build(),
            )
            .build()
    }
}
