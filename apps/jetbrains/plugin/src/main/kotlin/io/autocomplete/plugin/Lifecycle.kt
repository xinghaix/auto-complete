package io.autocomplete.plugin

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity

class AutoCompleteProjectActivity : ProjectActivity {
    private val log = Logger.getInstance(AutoCompleteProjectActivity::class.java)

    override suspend fun execute(project: Project) {
        runCatching { AutoCompleteProjectService.getInstance(project) }
            .onFailure { log.warn("Auto Complete project init failed", it) }
    }
}
