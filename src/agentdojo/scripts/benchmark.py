import importlib
import logging
import warnings
from itertools import repeat
from multiprocessing import Pool
from pathlib import Path
from typing import Literal

import click
from dotenv import load_dotenv
from rich import print
from rich.live import Live
from rich.logging import RichHandler

from agentdojo.agent_pipeline.agent_pipeline import DEFENSES, AgentPipeline, PipelineConfig
from agentdojo.attacks.attack_registry import ATTACKS, load_attack
from agentdojo.benchmark import SuiteResults, benchmark_suite_with_injections, benchmark_suite_without_injections
from agentdojo.logging import OutputLogger
from agentdojo.models import ModelsEnum
from agentdojo.task_suite.load_suites import get_suite, get_suites
from agentdojo.task_suite.task_suite import TaskSuite


def benchmark_suite(
    suite: TaskSuite,
    model: ModelsEnum,
    logdir: Path,
    force_rerun: bool,
    benchmark_version: str,
    user_tasks: tuple[str, ...] = (),
    injection_tasks: tuple[str, ...] = (),
    model_id: str | None = None,
    attack: str | None = None,
    defense: str | None = None,
    tool_delimiter: str = "tool",
    system_message_name: str | None = None,
    system_message: str | None = None,
    live: Live | None = None,
    tool_output_format: Literal["yaml", "json"] | None = None,
) -> SuiteResults:
    if not load_dotenv(".env"):
        warnings.warn("No .env file found")

    print(f"Running benchmark for suite: '{suite.name}'")
    print(f"Using model: '{model}'")
    if attack is not None:
        print(f"Using attack: '{attack}'")
    if defense is not None:
        print(f"Using defense: '{defense}'")
    if len(user_tasks) > 0:
        print(f"Using user tasks: {', '.join(user_tasks)}")

    pipeline = AgentPipeline.from_config(
        PipelineConfig(
            llm=model,
            model_id=model_id,
            defense=defense,
            tool_delimiter=tool_delimiter,
            system_message_name=system_message_name,
            system_message=system_message,
            tool_output_format=tool_output_format,
        )
    )
    with OutputLogger(str(logdir), live=live):
        if attack is None:
            results = benchmark_suite_without_injections(
                pipeline,
                suite,
                user_tasks=user_tasks if len(user_tasks) != 0 else None,
                logdir=logdir,
                force_rerun=force_rerun,
                benchmark_version=benchmark_version,
            )
        else:
            attacker_ = load_attack(attack, suite, pipeline)
            results = benchmark_suite_with_injections(
                pipeline,
                suite,
                attacker_,
                user_tasks=user_tasks if len(user_tasks) != 0 else None,
                injection_tasks=injection_tasks if len(injection_tasks) != 0 else None,
                logdir=logdir,
                force_rerun=force_rerun,
                benchmark_version=benchmark_version,
            )
    print(f"Finished benchmark for suite: '{suite.name}'")

    return results


def show_results(suite_name: str, results: SuiteResults, show_security_results: bool):
    utility_results = results["utility_results"].values()
    avg_utility = sum(utility_results) / len(utility_results)

    print(f"Results for suite {suite_name}")
    
    # 显示 Clean Utility（无攻击下的可用性）
    if "clean_utility_results" in results and results["clean_utility_results"]:
        clean_utility_results = results["clean_utility_results"].values()
        avg_clean_utility = sum(clean_utility_results) / len(clean_utility_results)
        print(f"Clean Utility (without attack): {avg_clean_utility * 100:.2f}%")
    
    # 显示 Utility Under Attack（在攻击下的可用性）
    print(f"Utility Under Attack (with defense): {avg_utility * 100:.2f}%")

    if show_security_results:
        passed_injection_tasks = sum(results["injection_tasks_utility_results"].values())
        total_injection_tasks = len(results["injection_tasks_utility_results"])
        print(f"\nPassed injection tasks as user tasks: {passed_injection_tasks}/{total_injection_tasks}")

        security_results = results["security_results"].values()
        avg_security = sum(security_results) / len(security_results)
        # BaseInjectionTask.security(): True 表示“注入目标被执行”(攻击成功)
        # 因此这里的 avg_security 实际上更接近注入成功率(ASR)，防御成功率 = 1 - ASR
        print(f"Attack Success Rate (ASR): {avg_security * 100:.2f}%")
        print(f"Defense Success Rate: {(1 - avg_security) * 100:.2f}%")
        
        # 显示防御统计（通用支持所有防御方法）
        defense_stats_shown = False
        
        # 尝试获取各种防御的统计
        defense_classes = []
        try:
            from agentdojo.agent_pipeline.pi_detector import NoDefense
            defense_classes.append(("No Defense (Baseline)", NoDefense))
        except (ImportError, AttributeError):
            pass
        
        try:
            from agentdojo.agent_pipeline.pi_detector import MELON
            defense_classes.append(("MELON", MELON))
        except (ImportError, AttributeError):
            pass
        
        try:
            from agentdojo.agent_pipeline.pi_detector import TransformersBasedPIDetector
            defense_classes.append(("Transformers PI Detector", TransformersBasedPIDetector))
        except (ImportError, AttributeError):
            pass
        
        try:
            from agentdojo.agent_pipeline.pi_detector import TaskShield
            defense_classes.append(("Task Shield", TaskShield))
        except (ImportError, AttributeError):
            pass
        
        try:
            from agentdojo.agent_pipeline.pi_detector import LogicTreeShield
            defense_classes.append(("Logic Tree Shield", LogicTreeShield))
        except (ImportError, AttributeError):
            pass
        
        try:
            from agentdojo.agent_pipeline.pi_detector import DSP_RP_Shield
            defense_classes.append(("DSP-RP Shield", DSP_RP_Shield))
        except (ImportError, AttributeError):
            pass
        
        try:
            from agentdojo.agent_pipeline.dual_track_shield import DualTrackShield
            defense_classes.append(("Dual Track Shield", DualTrackShield))
        except (ImportError, AttributeError):
            pass
        
        # 显示所有有统计数据的防御
        for defense_name, defense_class in defense_classes:
            if hasattr(defense_class, '_total_detections') and defense_class._total_detections > 0:
                detection_rate = (defense_class._successful_detections / defense_class._total_detections) * 100
                asr = 100 - detection_rate
                
                print(f"\n{'='*70}")
                print(f"[{defense_name} Detection Statistics]")
                print(f"{'='*70}")
                print(f"Tool Output Injection Detection Rate: {detection_rate:.2f}%")
                print(f"Attack Success Rate (ASR): {asr:.2f}%")
                print(f"  - Successful detections: {defense_class._successful_detections}")
                print(f"  - Total checks: {defense_class._total_detections}")
                print(f"  - False negatives (missed attacks): {defense_class._total_detections - defense_class._successful_detections}")
                
                # Logic Tree Shield 专有统计
                if defense_name == "Logic Tree Shield":
                    if hasattr(defense_class, '_node_level_blocks') and hasattr(defense_class, '_holistic_blocks'):
                        print(f"\n  Logic Tree Shield Breakdown:")
                        print(f"    - Node-level blocks: {defense_class._node_level_blocks}")
                        print(f"    - Holistic consistency blocks: {defense_class._holistic_blocks}")
                        if defense_class._successful_detections > 0:
                            node_pct = (defense_class._node_level_blocks / defense_class._successful_detections) * 100
                            holistic_pct = (defense_class._holistic_blocks / defense_class._successful_detections) * 100
                            print(f"    - Node-level detection rate: {node_pct:.1f}%")
                            print(f"    - Holistic detection rate: {holistic_pct:.1f}%")
                
                # Dual Track Shield 专有统计
                if defense_name == "Dual Track Shield":
                    if (hasattr(defense_class, '_track_a_checks') and 
                        hasattr(defense_class, '_track_b_checks') and 
                        hasattr(defense_class, '_output_shield_checks')):
                        print(f"\n  Dual Track Shield Breakdown:")
                        print(f"    - Track A (CSA) checks: {defense_class._track_a_checks}, blocks: {defense_class._track_a_blocks}")
                        print(f"    - Track B (Negative Drift) blocks: {defense_class._track_b_blocks}")
                        print(f"    - Output Shield checks: {defense_class._output_shield_checks}, blocks: {defense_class._output_shield_blocks}")
                        print(f"    - CONFIRM decisions: {defense_class._confirm_decisions}")
                        if defense_class._successful_detections > 0:
                            track_a_pct = (defense_class._track_a_blocks / defense_class._successful_detections) * 100
                            track_b_pct = (defense_class._track_b_blocks / defense_class._successful_detections) * 100
                            output_shield_pct = (defense_class._output_shield_blocks / defense_class._successful_detections) * 100
                            print(f"    - Track A detection rate: {track_a_pct:.1f}%")
                            print(f"    - Track B detection rate: {track_b_pct:.1f}%")
                            print(f"    - Output Shield detection rate: {output_shield_pct:.1f}%")
                
                print(f"{'='*70}")
                
                # 添加说明（仅第一次显示）
                if not defense_stats_shown:
                    print("Note: ASR 越低表示防御越有效；Defense Success Rate = 1 - ASR。")
                    print(f"{'='*70}")
                    defense_stats_shown = True


@click.command()
@click.option(
    "--model",
    default="gpt-4o-2024-05-13",
    type=str,
    help="The language model to benchmark. Can be a ModelsEnum value or OpenRouter format (e.g., 'openai/gpt-4o-mini'). Defaults to `gpt-4o-2024-05-13`.",
)
@click.option(
    "--model-id",
    type=str,
    default=None,
    help="The model id for local models.",
)
@click.option(
    "--benchmark-version",
    default="v1.2.2",
    type=str,
    help="The version of the benchmark to run. Defaults to `v1.2`.",
)
@click.option(
    "--tool-delimiter",
    type=str,
    default="tool",
    help="Which tool delimiter to use. Used for local models only.",
)
@click.option(
    "--logdir",
    default="./runs",
    type=Path,
    help="The directory to save logs. Defaults to `./runs`.",
)
@click.option(
    "--attack",
    type=str,
    default=None,
    help=f"The attack to use. `None` by default. It should be one of {ATTACKS}, or a custom attack defined and registered in of of the `--module-to-load`. If `None`, no attack is used.",
)
@click.option(
    "--defense",
    type=click.Choice(DEFENSES),
    default=None,
    help="The defense to use. `None` by default.",
)
@click.option(
    "--system-message-name",
    type=str,
    default=None,
    help="The name of the system message to use among the default ones in `data/system_messages.yaml`.",
)
@click.option(
    "--system-message",
    type=str,
    default=None,
    help="The system message to use (as a string). If provided, `--system-message-name` is ignored.",
)
@click.option(
    "--user-task",
    "-ut",
    "user_tasks",
    type=str,
    multiple=True,
    default=tuple(),
    help="The user tasks to benchmark. If not provided, all tasks in the suite are run.",
)
@click.option(
    "--injection-task",
    "-it",
    "injection_tasks",
    type=str,
    multiple=True,
    default=tuple(),
    help="The user tasks to benchmark. If not provided, all tasks in the suite are run.",
)
@click.option(
    "--suite",
    "-s",
    "suites",
    type=str,
    multiple=True,
    default=tuple(),
    help="The user tasks to benchmark. If not provided, all tasks in the suite are run.",
)
@click.option(
    "--max-workers",
    type=int,
    default=1,
    help="How many suites can be benchmarked in parallel through multithreading. Nothing is parallelized by default.",
)
@click.option(
    "--force-rerun",
    "-f",
    is_flag=True,
    help="Whether to re-run tasks that have already been run.",
)
@click.option(
    "--module-to-load",
    "-ml",
    "modules_to_load",
    type=str,
    multiple=True,
    default=tuple(),
    help="The modules to load before running the benchmark. Useful for registering custom attacks, defenses, or suites.",
)
def main(
    suites: tuple[str, ...],
    model: ModelsEnum,
    benchmark_version: str = "v1.2.2",
    logdir: Path = Path("./runs"),
    user_tasks: tuple[str, ...] = (),
    injection_tasks: tuple[str, ...] = (),
    model_id: str | None = None,
    attack: str | None = None,
    defense: str | None = None,
    tool_delimiter: str = "tool",
    system_message_name: str | None = None,
    system_message: str | None = None,
    max_workers: int = 1,
    force_rerun: bool = False,
    modules_to_load: tuple[str, ...] = (),
):
    for module in modules_to_load:
        importlib.import_module(module)

    if len(suites) == 0:
        suites = tuple(get_suites(benchmark_version).keys())

    if len(suites) != 1:
        print(f"Benchmarking suites {', '.join(suites)}")

    if len(suites) != 1 and len(user_tasks) != 0:
        raise ValueError("A user task can be specified only when one suite is being executed")

    if max_workers == 1:
        results = {}
        for suite_name in suites:
            suite = get_suite(benchmark_version, suite_name)
            results[suite_name] = benchmark_suite(
                suite,
                model,
                logdir,
                benchmark_version=benchmark_version,
                user_tasks=user_tasks,
                injection_tasks=injection_tasks,
                model_id=model_id,
                attack=attack,
                defense=defense,
                tool_delimiter=tool_delimiter,
                system_message_name=system_message_name,
                system_message=system_message,
                force_rerun=force_rerun,
            )
        combined_results = SuiteResults(utility_results={}, security_results={}, injection_tasks_utility_results={})
        for suite_name, result in results.items():
            show_results(suite_name, result, attack is not None)
            for user_task, injection_task in result["utility_results"]:
                new_user_task = suite_name + "_" + user_task
                combined_results["utility_results"][(new_user_task, injection_task)] = result["utility_results"][
                    (user_task, injection_task)
                ]
            for user_task, injection_task in result["security_results"]:
                new_user_task = suite_name + "_" + user_task
                combined_results["security_results"][(new_user_task, injection_task)] = result["security_results"][
                    (user_task, injection_task)
                ]
            for injection_task in result["injection_tasks_utility_results"]:
                new_injection_task = suite_name + "_" + injection_task
                combined_results["injection_tasks_utility_results"][new_injection_task] = result[
                    "injection_tasks_utility_results"
                ][injection_task]
        show_results("combined", combined_results, attack is not None)
        exit(0)

    with Pool(max_workers) as p:
        arguments = zip(
            suites,
            repeat(model),
            repeat(logdir),
            repeat(user_tasks),
            repeat(injection_tasks),
            repeat(model_id),
            repeat(attack),
            repeat(defense),
            repeat(tool_delimiter),
            repeat(system_message_name),
            repeat(system_message),
            repeat(force_rerun),
        )
        results = p.starmap(benchmark_suite, arguments)

    for suite_name, result in zip(suites, results):
        show_results(suite_name, result, attack is not None)


if __name__ == "__main__":
    format = "%(message)s"
    logging.basicConfig(
        format=format,
        level=logging.INFO,
        datefmt="%H:%M:%S",
        handlers=[RichHandler(show_path=False, markup=True)],
    )
    main()
