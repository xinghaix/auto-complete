package io.autocomplete.util

import java.nio.file.FileSystems
import java.nio.file.Path
import java.nio.file.PathMatcher

class IgnoreRules(
    globs: List<String>,
    private val respectGitignore: Boolean = true,
    gitignorePatterns: List<String> = emptyList(),
) {
    private data class CompiledRule(
        val negated: Boolean,
        val anchored: Boolean,
        val matchers: List<PathMatcher>,
    )

    private val rules: List<CompiledRule> =
        (globs + if (respectGitignore) gitignorePatterns else emptyList())
            .mapNotNull { compileRule(it) }

    fun isIgnored(
        path: String,
        relativePath: String? = null,
    ): Boolean {
        val rawSlash = path.replace('\\', '/')
        val relSlash = relativePath?.replace('\\', '/')?.trimStart('/')
        val allCandidates =
            buildList {
                if (rawSlash.isNotEmpty()) add(rawSlash)
                if (!relSlash.isNullOrEmpty() && relSlash != rawSlash) add(relSlash)
            }.mapNotNull { candidate -> runCatching { Path.of(candidate) }.getOrNull() }

        val anchoredCandidates =
            buildList {
                when {
                    !relSlash.isNullOrEmpty() -> add(relSlash)
                    rawSlash.isNotEmpty() && !isAbsoluteLike(rawSlash) -> add(rawSlash)
                    rawSlash.isNotEmpty() -> add(rawSlash)
                }
            }.mapNotNull { candidate -> runCatching { Path.of(candidate) }.getOrNull() }

        var matchedAny = false
        var ignored = false
        for (rule in rules) {
            val targets = if (rule.anchored) anchoredCandidates else allCandidates
            if (targets.isEmpty()) continue
            val hit =
                targets.any { target ->
                    rule.matchers.any { matcher ->
                        runCatching { matcher.matches(target) }.getOrDefault(false)
                    }
                }
            if (hit) {
                matchedAny = true
                ignored = !rule.negated
            }
        }
        if (matchedAny) return ignored

        // Built-in noise protection when no explicit rule (including negation) matched.
        for (p in allCandidates) {
            val name = p.fileName?.toString().orEmpty()
            if (name == "node_modules" || name == ".git") return true
        }
        if ("/node_modules/" in rawSlash || rawSlash.endsWith("/node_modules") || rawSlash.startsWith("node_modules/")) {
            return true
        }
        if ("/.git/" in rawSlash || rawSlash.endsWith("/.git") || rawSlash.startsWith(".git/")) {
            return true
        }
        return false
    }

    companion object {
        val DEFAULT_GLOBS =
            listOf(
                "**/.git/**",
                "**/node_modules/**",
                "**/dist/**",
                "**/build/**",
                "**/target/**",
                "**/.idea/**",
                "**/.gradle/**",
                "**/vendor/**",
            )

        fun parseGitignore(text: String): List<String> =
            text.lineSequence()
                .map { it.trim() }
                .filter { it.isNotEmpty() && !it.startsWith("#") }
                .mapNotNull { raw ->
                    val negated = raw.startsWith("!")
                    val body = if (negated) raw.removePrefix("!").trim() else raw
                    if (body.isEmpty()) return@mapNotNull null
                    val normalized = normalizeGitignoreBody(body)
                    if (negated) "!$normalized" else normalized
                }.toList()

        private fun normalizeGitignoreBody(body: String): String {
            val anchored = body.startsWith("/")
            val dirOnly = body.endsWith("/")
            val core = body.trim('/')
            if (core.isEmpty()) return ""
            return when {
                anchored && dirOnly -> "/$core/**"
                anchored -> "/$core"
                dirOnly -> "**/$core/**"
                core.contains('/') -> "**/$core"
                else -> "**/$core"
            }
        }

        private fun compileRule(rawLine: String): CompiledRule? {
            val trimmed = rawLine.trim()
            if (trimmed.isEmpty() || trimmed.startsWith("#")) return null
            val negated = trimmed.startsWith("!")
            val afterNeg = if (negated) trimmed.removePrefix("!").trim() else trimmed
            if (afterNeg.isEmpty()) return null

            val explicitGlob = afterNeg.startsWith("glob:")
            val body = if (explicitGlob) afterNeg.removePrefix("glob:") else afterNeg
            if (body.isEmpty()) return null

            val anchored = !explicitGlob && body.startsWith("/") && !body.startsWith("/**")
            val patterns = expandPatterns(body, anchored, explicitGlob)
            val matchers =
                patterns.mapNotNull { pattern ->
                    runCatching { FileSystems.getDefault().getPathMatcher("glob:$pattern") }.getOrNull()
                }
            if (matchers.isEmpty()) return null
            return CompiledRule(negated = negated, anchored = anchored, matchers = matchers)
        }

        private fun expandPatterns(
            body: String,
            anchored: Boolean,
            explicitGlob: Boolean,
        ): List<String> {
            val out = linkedSetOf<String>()
            if (explicitGlob) {
                out += body
                if (body.startsWith("**/")) out += body.removePrefix("**/")
                return out.toList()
            }
            if (anchored) {
                val stripped = body.removePrefix("/")
                if (stripped.endsWith("/")) {
                    val dir = stripped.trimEnd('/')
                    if (dir.isNotEmpty()) {
                        out += "$dir/**"
                        out += dir
                        out += "/$dir/**"
                        out += "/$dir"
                    }
                } else {
                    out += stripped
                    out += "/$stripped"
                    if (!stripped.endsWith("/**") && !stripped.contains('*')) {
                        out += "$stripped/**"
                        out += "/$stripped/**"
                    }
                }
                return out.toList()
            }

            if (body.endsWith("/")) {
                val dir = body.trimEnd('/')
                if (dir.isEmpty()) return emptyList()
                val withoutPrefix = dir.removePrefix("**/")
                out += "**/$withoutPrefix/**"
                out += "$withoutPrefix/**"
                out += "**/$withoutPrefix"
                out += withoutPrefix
                return out.toList()
            }

            if (body.startsWith("**/")) {
                val rest = body.removePrefix("**/")
                out += body
                out += rest
                if (!rest.endsWith("/**") && !rest.contains('*') && !rest.contains('/')) {
                    out += "**/$rest/**"
                    out += "$rest/**"
                }
                return out.toList()
            }

            if (!body.contains('/')) {
                out += "**/$body"
                out += body
                if (!body.contains('*')) {
                    out += "**/$body/**"
                    out += "$body/**"
                }
                return out.toList()
            }

            out += body
            if (!body.startsWith("**/")) {
                out += "**/$body"
            }
            return out.toList()
        }

        private fun isAbsoluteLike(path: String): Boolean {
            if (path.startsWith("/")) return true
            if (path.length >= 2 && path[0].isLetter() && path[1] == ':') return true
            return false
        }
    }
}
